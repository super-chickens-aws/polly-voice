// import {
//     S3Client,
//     PutObjectCommand
// } from "@aws-sdk/client-s3";

// const client = new S3Client({
//     region: "ap-southeast-1"
// });

// const BUCKET = "voice-ai-media-superchicken"; 

// export async function uploadAudio(audioStream, fileName) {

//     const bytes = await audioStream.transformToByteArray();

//     await client.send(
//         new PutObjectCommand({
//             Bucket: BUCKET,
//             Key: `tts/${fileName}`,
//             Body: bytes,
//             ContentType: "audio/mpeg"
//         })
//     );

//     return `https://${BUCKET}.s3.ap-southeast-1.amazonaws.com/tts/${fileName}`;

// }
import {
    S3Client,
    PutObjectCommand,
    GetObjectCommand
} from "@aws-sdk/client-s3";

import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const client = new S3Client({
    region: "ap-southeast-1"
});

const BUCKET = "voice-ai-media-superchicken";

export async function uploadAudio(audioStream, fileName) {

    const bytes = await audioStream.transformToByteArray();

    const key = `tts/${fileName}`;

    await client.send(

        new PutObjectCommand({

            Bucket: BUCKET,

            Key: key,

            Body: bytes,

            ContentType: "audio/mpeg"

        })

    );

    return key;

}

export async function getDownloadUrl(key) {

    const command = new GetObjectCommand({

        Bucket: BUCKET,

        Key: key,

        ResponseContentDisposition: 'attachment; filename="speech.mp3"'

    });

    return await getSignedUrl(client, command, {

        expiresIn: 300

    });

}