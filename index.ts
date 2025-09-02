import { existsSync, mkdirSync, createWriteStream, createReadStream, unlinkSync, statSync, readFileSync } from "fs";
import { MassDownloadList } from "./utils/massdownloadlist";
import { pipeline } from "stream/promises";
import { glob } from "fast-glob";
import { Readable } from "stream";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
let DownloadsFolder = "downloads/"
const requiredEnvVars = ['S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_BUCKET_NAME'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
    console.error('Missing required environment variables:', missingVars.join(', '));
    console.error('Please check your .env file');
    process.exit(1);
}
const BUCKET_NAME = process.env.S3_BUCKET_NAME;
const UPLOAD_PREFIX = process.env.S3_UPLOAD_PREFIX || "";
const s3Client = new S3Client({
    region: process.env.AWS_REGION || "us-east-1",
    endpoint: process.env.S3_ENDPOINT || undefined,
    credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    },
    forcePathStyle: process.env.S3_ENDPOINT ? true : false,
});
if(!existsSync(DownloadsFolder)) {
    mkdirSync(DownloadsFolder, { recursive: true });
    console.log(`Created folder: ${DownloadsFolder}`);
}
const existingFiles = await glob('downloads/*');
const existingFilenames = existingFiles.map(file => file.split('/').pop());
for (const url of MassDownloadList) {
    const filename = url.split('&name=')[1];
    if (existingFilenames.includes(filename)) {
        console.log(`Skipping (already exists): ${filename}`);
        continue;
    }
    const response = await fetch(url);
    if (!response.body) {
        console.log(`Error: No body for ${filename}`);
        continue;
    }
    const filestream = createWriteStream(`downloads/${filename}`);
    await pipeline(Readable.fromWeb(response.body), filestream);
    console.log(`Downloaded: ${filename}`);
}
const downloadedFiles = await glob('downloads/*');
const concurrencyLimit = 3;
let activeUploads = 0;
let uploadStats = { success: 0, failed: 0 };
function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
let uploadQueue: (() => Promise<void>)[] = [];
async function runUploadQueue() {
    while (uploadQueue.length > 0 && activeUploads < concurrencyLimit) {
        const task = uploadQueue.shift();
        if (task) {
            activeUploads++;
            task().finally(() => {
                activeUploads--;
                runUploadQueue();
            });
            await sleep(300); 
        }
    }
}
for (const filePath of downloadedFiles) {
    const filename = filePath.split('/').pop();
    uploadQueue.push(async () => {
        try {
            const fileSize = statSync(filePath).size;
            const fileBody = fileSize < 5 * 1024 * 1024
                ? readFileSync(filePath)
                : createReadStream(filePath);

            const uploadParams = {
                Bucket: BUCKET_NAME,
                Key: UPLOAD_PREFIX + filename,
                Body: fileBody,
                ContentType: "image/png"
            };
            const command = new PutObjectCommand(uploadParams);
            await s3Client.send(command);
            console.log(`Uploaded to S3: ${UPLOAD_PREFIX}${filename}`);
            uploadStats.success++;
            unlinkSync(filePath);
            console.log(`Deleted local file: ${filename}`);
        } catch (error: any) {
            console.error(`Error uploading ${filename}: `, error.message);
            uploadStats.failed++;
        }
    });
}
const initialUploads = Array(concurrencyLimit).fill(null).map(() => runUploadQueue());
await Promise.all(initialUploads);