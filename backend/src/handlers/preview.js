import { generateSpeech } from "../services/index.js";

export async function getPreviewHandler(body) {
    const {
        text,
        voiceId,
        engine,
        speed,
        pitch,
        volume
    } = body;

    // trả về audioStream dưới dạng base64 để preview
    const audioStream = await generateSpeech({
        text,
        voiceId,
        engine,
        speed,
        pitch,
        volume
    });

    // Convert audioStream to byte array
    const bytes = await audioStream.transformToByteArray();

    return {
        statusCode: 200,
        headers: {
            "Content-Type": "audio/mpeg"
        },

        isBase64Encoded: true,  // Đặt isBase64Encoded thành true để trả về dữ liệu âm thanh dưới dạng base64
        body: Buffer.from(bytes).toString("base64") // Chuyển đổi byte array thành base64
    };
}