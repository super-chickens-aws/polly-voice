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

    engine

}) {

    const command = new SynthesizeSpeechCommand({

        Text: text,

        OutputFormat: "mp3",

        VoiceId: voiceId,

        Engine: engine

    });

    const response = await client.send(command);

    return response.AudioStream;

}