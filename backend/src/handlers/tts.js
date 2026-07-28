import { generateSpeech, getDownloadUrl, saveHistory, uploadAudio } from "../services/index.js";

export async function textToSpeechHandler(event) {
    const body = JSON.parse(event.body);
    const {
        text,
        voiceId,
        engine,
        speed,
        pitch,
        volume
    } = body;

    const audioStream = await generateSpeech({
        text,
        voiceId,
        engine,
        speed,
        pitch,
        volume
    });
    
    const fileName = `${Date.now()}.mp3`;

    const key = await uploadAudio(audioStream, fileName); // Save the audio file to S3 and get the key
    await saveHistory({
        userId: event.requestContext.authorizer.jwt.claims.sub,
        createdAt: new Date().toISOString(),
        text,
        voiceId,
        engine,
        speed,
        pitch,
        volume,
        audioKey: key
    }); // Save the history record to DynamoDB
    const downloadUrl = await getDownloadUrl(key); // Get the download URL for the audio file from S3

    return {
        statusCode: 200,
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            downloadUrl
        })
    };
}