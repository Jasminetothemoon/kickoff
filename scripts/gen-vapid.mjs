// 生成 VAPID 密钥对:node scripts/gen-vapid.mjs,把输出写进 .env 后重启
import webpush from "web-push";
const k = webpush.generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY=${k.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${k.privateKey}`);
