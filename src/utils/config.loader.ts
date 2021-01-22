import * as dotenv from "dotenv";
import config from "../config.json"

dotenv.config();
let path: string

switch (process.env.NODE_ENV) {
    case "production":
        path = `${__dirname}/../.env.production`
        break
    default:
        path = `${__dirname}/../.env.development`
        break
}
dotenv.config({ path })

export default {
    ...config,
    port: process.env.PORT || config.app.PORT || 3000
}
