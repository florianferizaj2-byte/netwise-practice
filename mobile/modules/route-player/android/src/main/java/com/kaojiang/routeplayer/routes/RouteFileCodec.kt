package com.kaojiang.routeplayer.routes

import com.kaojiang.routeplayer.model.Coordinates
import org.json.JSONArray
import org.json.JSONObject
import org.w3c.dom.Element
import java.io.ByteArrayInputStream
import java.io.InputStream
import java.io.ByteArrayOutputStream
import java.util.UUID
import javax.xml.parsers.DocumentBuilderFactory
import kotlin.math.abs

enum class RouteFileFormat(val extension: String, val mimeType: String) {
    NATIVE("rplroute", "application/json"), GPX("gpx", "application/gpx+xml"), KML("kml", "application/vnd.google-earth.kml+xml")
}

data class RouteDocument(val name: String, val draft: RouteDraft, val id: String = UUID.randomUUID().toString(),
    val createdAt: Long = System.currentTimeMillis()) {
    init {
        require(name.isNotBlank() && name.length <= 120) { "路线名称须为 1–120 个字符" }
        require(name.none { it.code < 32 }) { "路线名称不能包含控制字符" }
        require(UUID.fromString(id).toString() == id) { "路线编号无效" }
        require(createdAt in 0L..9_007_199_254_740_991L) { "路线时间无效" }
        require(draft.canStart) { "路线至少需要两个不同的点" }
    }
}

/** Canonical WGS84 documents. XML geometry stays interoperable; extensions preserve the entire draft. */
object RouteFileCodec {
    const val MAX_BYTES = 2_097_152
    private const val NAMESPACE = "https://routeplayer.app/schema/1"
    fun encode(document: RouteDocument, format: RouteFileFormat = RouteFileFormat.NATIVE): String = when (format) {
        RouteFileFormat.NATIVE -> JSONObject().put("format", "route-player").put("version", 1)
            .put("coordinateSystem", "WGS84").put("id", document.id).put("name", document.name)
            .put("createdAt", document.createdAt).put("draft", JSONObject(RouteDraftCodec.encode(document.draft))).toString()
        RouteFileFormat.GPX -> buildString {
            append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<gpx version=\"1.1\" creator=\"Route Player\" xmlns=\"http://www.topografix.com/GPX/1/1\" xmlns:rp=\"$NAMESPACE\">\n<trk><name>${escape(document.name)}</name><extensions>")
            append("<rp:document>${escape(encode(document))}</rp:document></extensions><trkseg>\n")
            document.draft.points.forEachIndexed { i, point ->
                append("<trkpt lat=\"${point.latitude}\" lon=\"${point.longitude}\"><name>点 ${i+1}</name></trkpt>\n")
            }
            append("</trkseg></trk></gpx>\n")
        }
        RouteFileFormat.KML -> buildString {
            append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<kml xmlns=\"http://www.opengis.net/kml/2.2\"><Document><name>${escape(document.name)}</name>")
            append("<ExtendedData><Data name=\"routePlayerDocument\"><value>${escape(encode(document))}</value></Data></ExtendedData>")
            append("<Placemark><name>${escape(document.name)}</name><LineString><coordinates>")
            append(document.draft.points.joinToString(" ") { "${it.longitude},${it.latitude},0" })
            append("</coordinates></LineString></Placemark></Document></kml>\n")
        }
    }

    fun decode(value: String, fallbackName: String = "导入的路线"): RouteDocument {
        require(value.toByteArray(Charsets.UTF_8).size <= MAX_BYTES) { "路线文件不能超过 2 MB" }
        val source = value.trim().removePrefix("\uFEFF").trim()
        if (source.startsWith('{')) return decodeNative(JSONObject(source))
        require(!source.contains("<!DOCTYPE", true) && !source.contains("<!ENTITY", true)) { "路线文件不能包含外部实体" }
        val factory = DocumentBuilderFactory.newInstance().apply {
            isNamespaceAware = true
            isExpandEntityReferences = false
            runCatching { setFeature("http://apache.org/xml/features/disallow-doctype-decl", true) }
            runCatching { setFeature("http://xml.org/sax/features/external-general-entities", false) }
            runCatching { setFeature("http://xml.org/sax/features/external-parameter-entities", false) }
        }
        val root = factory.newDocumentBuilder().parse(ByteArrayInputStream(source.toByteArray(Charsets.UTF_8))).documentElement
        val points: List<Coordinates>
        val embedded: String?
        val name: String
        val speed: Double
        val repeat: RepeatMode
        when (root.local()) {
            "gpx" -> {
                val container = root.descendants("trk").firstOrNull() ?: root.descendants("rte").firstOrNull() ?: root
                val nodes = container.descendants("trkpt").ifEmpty { container.descendants("rtept") }.ifEmpty { container.descendants("wpt") }
                require(nodes.size <= RouteDraft.MAX_POINTS) { "路线最多支持 200 个点，请先简化轨迹" }
                points = nodes.map { Coordinates(it.getAttribute("lat").toDouble(), it.getAttribute("lon").toDouble()) }
                embedded = container.descendants("document").firstOrNull { it.namespaceURI == NAMESPACE }?.textContent
                name = container.children("name").firstOrNull()?.textContent?.trim().orEmpty().ifBlank { fallbackName }
                speed = container.descendants("speedKph").firstOrNull()?.textContent?.trim()?.toDouble() ?: 6.0
                repeat = if (container.descendants("loop").firstOrNull()?.textContent?.trim() == "true") RepeatMode.CLOSED_LOOP else RepeatMode.ONCE
            }
            "kml" -> {
                val container = root.descendants("Document").firstOrNull() ?: root
                val line = container.descendants("LineString").firstOrNull()
                val tokens = line?.descendants("coordinates")?.firstOrNull()?.textContent?.trim()?.split(Regex("\\s+"))?.filter { it.isNotBlank() }
                points = if (tokens != null) {
                    require(tokens.size <= RouteDraft.MAX_POINTS) { "路线最多支持 200 个点，请先简化轨迹" }
                    tokens.map(::kmlPoint)
                } else {
                    val places = container.descendants("Placemark").filter { it.descendants("Point").isNotEmpty() }
                        .sortedBy { it.data("order")?.toIntOrNull() ?: Int.MAX_VALUE }
                    require(places.size <= RouteDraft.MAX_POINTS) { "路线最多支持 200 个点，请先简化轨迹" }
                    places.map { kmlPoint(it.descendants("Point").first().descendants("coordinates").first().textContent) }
                }
                embedded = container.data("routePlayerDocument")
                name = container.children("name").firstOrNull()?.textContent?.trim().orEmpty().ifBlank { fallbackName }
                speed = container.data("speedKph")?.toDouble() ?: 6.0
                repeat = if (container.data("loop") == "true") RepeatMode.CLOSED_LOOP else RepeatMode.ONCE
            }
            else -> error("支持本应用路线文件、GPX 和 KML")
        }
        if (!embedded.isNullOrBlank()) {
            val document = decodeNative(JSONObject(embedded))
            require(points.size == document.draft.points.size && points.zip(document.draft.points).all { (a,b) ->
                abs(a.latitude-b.latitude) < 1e-8 && abs(a.longitude-b.longitude) < 1e-8
            }) { "文件中的轨迹与路线设置不一致" }
            return document
        }
        // Generic documents lack speed/repeat metadata: expose our documented defaults, without changing point order.
        return RouteDocument(name, RouteDraft(mode = SelectionMode.PATH, speedKph = speed, repeat = repeat, pathPoints = points))
    }

    fun read(input: InputStream): String {
        val output = ByteArrayOutputStream()
        val buffer = ByteArray(8192)
        while (true) {
            val count = input.read(buffer)
            if (count < 0) break
            require(output.size() + count <= MAX_BYTES) { "路线文件不能超过 2 MB" }
            output.write(buffer, 0, count)
        }
        return output.toByteArray().toString(Charsets.UTF_8)
    }

    private fun decodeNative(json: JSONObject): RouteDocument {
        require(json.getString("format") == "route-player" && json.get("version") is Number && json.getDouble("version") == 1.0) { "不支持此路线文件版本" }
        require(json.getString("coordinateSystem") == "WGS84") { "路线坐标必须为 WGS84" }
        val d = json.getJSONObject("draft")
        fun points(array: JSONArray, limit: Int): List<Coordinates> {
            require(array.length() <= limit) { "路线点数超过限制" }
            return List(array.length()) { i ->
                val p = array.getJSONArray(i); require(p.length() == 2)
                Coordinates(p.getDouble(0), p.getDouble(1))
            }
        }
        val timestamp = json.get("createdAt")
        require(timestamp is Number && timestamp.toDouble() == timestamp.toLong().toDouble()) { "路线时间无效" }
        return RouteDocument(json.getString("name"), RouteDraft(mode = SelectionMode.valueOf(d.getString("mode")),
            repeat = RepeatMode.valueOf(d.getString("repeat")), speedKph = d.getDouble("speed"),
            twoPoints = points(d.getJSONArray("twoPoints"), 2), pathPoints = points(d.getJSONArray("pathPoints"), 200)),
            json.getString("id"), timestamp.toLong())
    }
    private fun escape(value: String) = value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&apos;")
    private fun kmlPoint(value: String): Coordinates {
        val p = value.trim().split(','); require(p.size >= 2) { "KML 坐标无效" }
        return Coordinates(p[1].toDouble(), p[0].toDouble())
    }
    private fun Element.local() = localName ?: tagName.substringAfter(':')
    private fun Element.children(name: String) = (0 until childNodes.length).mapNotNull { childNodes.item(it) as? Element }.filter { it.local() == name }
    private fun Element.descendants(name: String): List<Element> {
        val nodes = getElementsByTagNameNS("*", name)
        return (0 until nodes.length).map { nodes.item(it) as Element }
    }
    private fun Element.data(name: String) = children("ExtendedData").flatMap { it.children("Data") }
        .firstOrNull { it.getAttribute("name") == name }?.children("value")?.firstOrNull()?.textContent?.trim()
}
