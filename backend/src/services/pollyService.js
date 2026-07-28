import {
    PollyClient,
    SynthesizeSpeechCommand
} from "@aws-sdk/client-polly";

const client = new PollyClient({
    region: "ap-southeast-1"
});

function escapeSSML(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

export async function generateSpeech({
    text,
    voiceId,
    engine,
    speed,
    pitch,
    volume
}) {

    // Escape text để tránh lỗi XML/SSML
    const safeText = escapeSSML(text);

    // Pitch
    let pitchValue = "0%";

    if (pitch > 0) {
        pitchValue = `+${pitch}%`;
    } else if (pitch < 0) {
        pitchValue = `${pitch}%`;
    }

    // Volume
    const volumeDb = Math.round((volume - 100) / 10);

    let volumeValue = "0dB";

    if (volumeDb > 0) {
        volumeValue = `+${volumeDb}dB`;
    } else if (volumeDb < 0) {
        volumeValue = `${volumeDb}dB`;
    }

    // SSML
    const ssml = `
        <speak>
            <prosody
                rate="${speed}%"
                pitch="${pitchValue}"
                volume="${volumeValue}"
            >
                ${safeText}
            </prosody>
        </speak>
    `;

    const command = new SynthesizeSpeechCommand({
        Engine: engine,
        VoiceId: voiceId,
        OutputFormat: "mp3",
        TextType: "ssml",
        Text: ssml
    });

    const response = await client.send(command);

    return response.AudioStream;
}