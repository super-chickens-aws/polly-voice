import {
    PollyClient,
    SynthesizeSpeechCommand
} from "@aws-sdk/client-polly";

const client = new PollyClient({
    region: "ap-southeast-1"
});

export async function generateSpeech(text) {

    const command = new SynthesizeSpeechCommand({
        Engine: "neural",
        VoiceId: "Danielle",
        OutputFormat: "mp3",
        Text: text
    });

    const response = await client.send(command);
    
    return response.AudioStream;

}