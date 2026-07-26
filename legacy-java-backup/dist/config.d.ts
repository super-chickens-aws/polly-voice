import 'dotenv/config';
export declare const config: {
    readonly nodeEnv: "development" | "test" | "production";
    readonly port: number;
    readonly allowedOrigins: string[];
    readonly publicBaseUrl: string;
    readonly mediaDirectory: string;
    readonly aws: {
        readonly enabled: boolean;
        readonly region: string;
        readonly bucket: string;
        readonly dynamoTableName: string;
        readonly presignedUrlTtlSeconds: number;
        readonly cognitoUserPoolId: string;
        readonly cognitoClientId: string;
        readonly cognitoIssuerUri: string;
        readonly transcribeLanguageCode: string;
    };
};
