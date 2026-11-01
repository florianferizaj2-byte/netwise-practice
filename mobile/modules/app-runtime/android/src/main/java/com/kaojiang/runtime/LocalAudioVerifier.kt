package com.kaojiang.runtime
import java.io.File
import java.security.MessageDigest
object LocalAudioVerifier {
  fun sha256(input: File, roots: List<File>): String {
    val file = input.canonicalFile
    require(roots.any { file.path.startsWith(it.canonicalPath + File.separator) }) { "File outside application storage" }
    require(file.isFile && file.length() in 12..4194304) { "Invalid audio file size" }
    val digest = MessageDigest.getInstance("SHA-256")
    file.inputStream().use { stream ->
      val buffer = ByteArray(16384)
      while (true) { val n = stream.read(buffer); if(n < 0) break; digest.update(buffer,0,n) }
    }
    return digest.digest().joinToString("") { "%02x".format(it.toInt() and 255) }
  }
}
