import { getUser, createUser } from "./src/services/userService.js";
import { generateSpeech } from "./src/services/pollyService.js";
import {
    uploadAudio,
    getDownloadUrl
} from "./src/services/s3Service.js";
import {
    saveHistory,
    getHistory
} from "./src/services/historyService.js";

export const handler = async (event) => {

    const path = event.requestContext.http.path;

    // =============================
    // POST /tts/preview
    // =============================
    if (path === "/tts/preview") {
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

        const bytes = await audioStream.transformToByteArray();

        return {
            statusCode: 200,
            headers: {
                "Content-Type": "audio/mpeg"
            },

            isBase64Encoded: true,
            body: Buffer.from(bytes).toString("base64")
        };
    }

    // =============================
    // POST /tts
    // =============================
    if (path === "/tts") {
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

        const key = await uploadAudio(audioStream, fileName);
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
        });
        const downloadUrl = await getDownloadUrl(key);

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

    // =============================
    // GET /history
    // =============================
    if (path === "/history") {

        const userId =
            event.requestContext.authorizer.jwt.claims.sub;

        const history =
            await getHistory(userId);

        return {

            statusCode: 200,

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify(history)

        };

    }

    // =============================
    // POST /history/download
    // =============================
    if (path === "/history/download") {

        const body = JSON.parse(event.body);

        const { audioKey } = body;

        const downloadUrl = await getDownloadUrl(audioKey);

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

    // =============================
    // GET /auth/profile
    // =============================

    const claims = event.requestContext.authorizer.jwt.claims;
    const userId = claims.sub;
    const email = claims.email;
    let user = await getUser(userId);

    if (!user) {
        user = {
            userId,
            email,
            displayName: "",
            avatar: "",
            role: "USER",
            createdAt: new Date().toISOString()
        };

        await createUser(user);
    }

    return {
        statusCode: 200,
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(user)
    };
};