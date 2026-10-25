package com.kaojiang.routeplayer

import java.net.HttpURLConnection
import java.net.URI
import org.json.JSONObject

internal object LearningGateGateway {
    fun endpoint(base: String, debug: Boolean): URI {
        val uri = URI(base.trimEnd('/'))
        check(uri.userInfo == null && uri.query == null && uri.fragment == null && !uri.host.isNullOrBlank()) { "学习服务地址无效" }
        val local = uri.host in listOf("localhost", "127.0.0.1", "10.0.2.2", "10.0.3.2", "[::1]")
        check(uri.scheme == "https" || (debug && uri.scheme == "http" && local)) { "学习资格验证必须使用 HTTPS" }
        return URI(uri.toString() + "/location-learning/consume")
    }

    fun verify(base: String, token: String, permit: String, version: String, debug: Boolean): String {
        check(token.length in 1..4096 && !token.contains('\r') && !token.contains('\n')) { "请重新登录考匠" }
        check(permit.matches(Regex("[A-Za-z0-9_-]{43}"))) { "请从考匠重新核验学习资格" }
        check(version.matches(Regex("[0-9A-Za-z.+_-]{1,40}"))) { "App 版本信息无效" }
        val connection = endpoint(base, debug).toURL().openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = 10_000
            connection.readTimeout = 10_000
            connection.instanceFollowRedirects = false
            connection.requestMethod = "POST"
            connection.doOutput = true
            connection.setRequestProperty("Authorization", "Bearer $token")
            connection.setRequestProperty("Content-Type", "application/json")
            connection.setRequestProperty("X-Client", "mobile")
            connection.setRequestProperty("X-App-Version", version)
            connection.outputStream.use { it.write(JSONObject().put("permit", permit).toString().toByteArray(Charsets.UTF_8)) }
            check(connection.responseCode == 200) { if (connection.responseCode == 426) "请更新考匠 App 后再进入" else "学习资格未通过，请联网完成今天的专项刷题后重新进入" }
            return connection.inputStream.use { input ->
                val bytes = input.readBytesBounded(16_384)
                String(bytes, Charsets.UTF_8)
            }
        } finally { connection.disconnect() }
    }

    private fun java.io.InputStream.readBytesBounded(limit: Int): ByteArray {
        val output = java.io.ByteArrayOutputStream()
        val buffer = ByteArray(1024)
        while (true) { val count = read(buffer); if (count < 0) break; check(output.size() + count <= limit) { "学习服务返回异常，请稍后重试" }; output.write(buffer, 0, count) }
        return output.toByteArray()
    }
}
