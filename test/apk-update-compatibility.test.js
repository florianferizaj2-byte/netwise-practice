import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {applyPackagingProperties,applyExtractionManifest}=require('../mobile/plugins/withApkUpdateCompatibility.js');
test('APK compatibility uses one explicit legacy packaging value and preserves unrelated Gradle configuration',()=>{
  const config={modResults:[{type:'property',key:'expo.useLegacyPackaging',value:'false'},
    {type:'comment',value:'keep'},{type:'property',key:'reactNativeArchitectures',value:'armeabi-v7a,arm64-v8a,x86,x86_64'}]};
  const first=applyPackagingProperties(config);applyPackagingProperties(first);
  assert.equal(first.modResults.filter(p=>p.key==='expo.useLegacyPackaging').length,1);
  assert.equal(first.modResults.find(p=>p.key==='expo.useLegacyPackaging').value,'true');
  assert.equal(first.modResults.find(p=>p.key==='reactNativeArchitectures').value,'armeabi-v7a,arm64-v8a,x86,x86_64');
  assert.ok(first.modResults.some(p=>p.type==='comment'&&p.value==='keep'));
});
test('APK extraction is explicit without changing backup, package identity or other application attributes',()=>{
  const config={modResults:{manifest:{application:[{$:{'android:allowBackup':'true','android:extractNativeLibs':'false','android:label':'@string/app_name'}}]}}};
  const next=applyExtractionManifest(config).modResults.manifest.application[0].$;
  assert.equal(next['android:extractNativeLibs'],'true');assert.equal(next['android:allowBackup'],'true');assert.equal(next['android:label'],'@string/app_name');
  assert.throws(()=>applyExtractionManifest({modResults:{manifest:{}}}),/Android application manifest/);
});
test('production packaging plugin and v1/v2/v3 schemes remain wired to the existing release certificate',()=>{
  const app=JSON.parse(fs.readFileSync(new URL('../mobile/app.json',import.meta.url),'utf8')).expo;
  assert.ok(app.plugins.includes('./plugins/withApkUpdateCompatibility'));
  assert.equal(app.android.package,'com.kaojiang.app');
  const signing=fs.readFileSync(new URL('../mobile/plugins/release-signing.gradle',import.meta.url),'utf8');
  for(const v of [1,2,3])assert.match(signing,new RegExp('enableV'+v+'Signing true'));
  assert.match(signing,/signingConfig signingConfigs\.release/);
});
