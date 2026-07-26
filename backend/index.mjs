import { getUser, createUser } from "./src/services/userService.js";
import { generateSpeech } from "./src/services/pollyService.js";
import {
    uploadAudio,
    getDownloadUrl
} from "./src/services/s3Service.js";

export const handler = async (event) => {

    const path = event.requestContext.http.path;

    // =============================
    // POST /tts
    // =============================
    if (path === "/tts") {

        const body = JSON.parse(event.body);

        const text = body.text;

        const audioStream = await generateSpeech(text);

        const fileName = `${Date.now()}.mp3`;

        // const audioUrl = await uploadAudio(audioStream, fileName);

        // return {

        //     statusCode: 200,

        //     headers: {
        //         "Content-Type": "application/json"
        //     },

        //     body: JSON.stringify({
        //         audioUrl
        //     })

        // };
        const key = await uploadAudio(audioStream, fileName);

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