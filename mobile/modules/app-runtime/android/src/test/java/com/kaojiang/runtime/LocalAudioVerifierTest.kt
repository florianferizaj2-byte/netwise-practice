package com.kaojiang.runtime
import java.io.File
import java.nio.file.Files
import org.junit.Assert.*
import org.junit.Test
class LocalAudioVerifierTest {
 @Test fun knownHashMatches() { val dir=Files.createTempDirectory("voice-hash").toFile();try {val f=File(dir,"clip.wav");f.writeText("abcdefghijkl");assertEquals("d682ed4ca4d989c134ec94f1551e1ec580dd6d5a6ecde9f3d35e6e4a717fbde4",LocalAudioVerifier.sha256(f,listOf(dir)));}finally{dir.deleteRecursively()} }
 @Test fun refusesOutsideRoot(){val dir=Files.createTempDirectory("voice-root").toFile();val f=Files.createTempFile("outside-voice",".wav").toFile();try{f.writeText("abcdefghijkl");try{LocalAudioVerifier.sha256(f,listOf(dir));fail("outside path accepted")}catch(_:IllegalArgumentException){}}finally{f.delete();dir.deleteRecursively()}}
 @Test fun rejectsOversizedAndIncomplete(){val dir=Files.createTempDirectory("voice-limit").toFile();try{for(size in listOf(0,11,4194305)){val f=File(dir,"clip.wav");f.writeBytes(ByteArray(size));try{LocalAudioVerifier.sha256(f,listOf(dir));fail("invalid size accepted")}catch(_:IllegalArgumentException){}}}finally{dir.deleteRecursively()}}
 @Test fun changedContentChangesHash(){val dir=Files.createTempDirectory("voice-change").toFile();try{val f=File(dir,"clip.wav");f.writeText("abcdefghijkl");val a=LocalAudioVerifier.sha256(f,listOf(dir));f.writeText("abcdefghijkl!");assertNotEquals(a,LocalAudioVerifier.sha256(f,listOf(dir)));}finally{dir.deleteRecursively()}}
}
