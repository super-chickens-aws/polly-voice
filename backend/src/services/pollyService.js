import {
    PollyClient,
    SynthesizeSpeechCommand
} from "@aws-sdk/client-polly";

const client = new PollyClient({
    region: "ap-southeast-1"
});

export async function generateSpeech({

    text,

    voiceId,

    engine,

    speed

}) {

    const ssml = `
<speak>
    <prosody rate="${speed}%">
        ${text}
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