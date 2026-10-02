const fs = require("fs");
const data = Buffer.from(process.argv[2], "base64").toString("utf8");
fs.appendFileSync("C:/pcc folder/PCC/mfp-web/src/app/(app)/reports/sbfp-narrative/page.tsx", data, "utf8");
console.log("Appended chunk, bytes:", Buffer.byteLength(data));
