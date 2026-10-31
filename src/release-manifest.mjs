import {verify,createPublicKey} from 'node:crypto';
// Preparation only: no downloader, execution, implicit trust-on-first-use, or
// automatic updates. A release owner must pin an Ed25519 public key in a build.
export function verifyReleaseManifest(envelope,publicKey,{currentVersion,now=Date.now()}={}){
 if(!publicKey)throw Error('update_trust_not_configured');
 const key=publicKey.type==='public'?publicKey:createPublicKey(publicKey);if(key.asymmetricKeyType!=='ed25519')throw Error('update_trust_invalid');
 if(typeof envelope?.payload!=='string'||envelope.payload.length>16384||typeof envelope.signature!=='string'||envelope.signature.length!==88)throw Error('invalid_release_envelope');
 if(!verify(null,Buffer.from(envelope.payload),publicKey,Buffer.from(envelope.signature,'base64')))throw Error('release_signature_invalid');
 const m=JSON.parse(envelope.payload),validVersion=v=>typeof v==='string'&&/^\d+\.\d+\.\d+$/.test(v);
 if(!validVersion(m.version)||!validVersion(currentVersion)||m.platform!=='win32-x64'||m.channel!=='stable'||!/^[a-f0-9]{64}$/.test(m.sha256)||!Number.isSafeInteger(m.bytes)||m.bytes<1||m.bytes>2e9||!Number.isFinite(Date.parse(m.expiresAt))||Date.parse(m.expiresAt)<=now)throw Error('release_metadata_invalid');
 const next=m.version.split('.').map(Number),prior=currentVersion.split('.').map(Number);let newer=false;for(let i=0;i<3;i++){if(next[i]===prior[i])continue;newer=next[i]>prior[i];break;}if(!newer)throw Error('release_not_newer');
 const url=new URL(m.url);if(url.protocol!=='https:'||url.username||url.password||url.hash)throw Error('release_url_invalid');
 return {...m};
}
