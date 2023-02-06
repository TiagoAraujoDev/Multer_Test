import dotenv from "dotenv";
import express, { Request, Response } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs/promises";
import {
  GetObjectCommand,
  GetObjectCommandInput,
  PutObjectCommand,
  PutObjectCommandInput,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { multerConfig } from "./multerConfig";

dotenv.config();

const bucketRegion = process.env.BUCKET_REGION;
const bucketName = process.env.BUCKET_NAME;
const accessKey = process.env.ACCESS_KEY;
const secretAccessKey = process.env.SECRET_ACCESS_KEY;

const app = express();

app.use("/", express.static("./tmp/"));

const avatarUpload = multer(multerConfig);

const s3 = new S3Client({
  credentials: {
    accessKeyId: accessKey!,
    secretAccessKey: secretAccessKey!,
  },
  region: bucketRegion,
});

/*
 * GET request needs a database to access the imageName
 * saved in the POST request.
 */
app.get("/", async (req: Request, res: Response) => {
  const {} = req.body;

  return res.json();
})

/*
 * Needs to save the imageName with a userId in the database
 */
app.post(
  "/upload",
  avatarUpload.single("avatar"),
  async (req: Request, res: Response) => {
    const file = req.file;

    const dirName = path.resolve(multerConfig.tmpFolder, file?.filename!);
    const fileContent = await fs.readFile(dirName);
    console.log(fileContent);

    const putParams: PutObjectCommandInput = {
      Bucket: bucketName,
      Key: file?.filename,
      Body: fileContent,
      ContentType: file?.mimetype,
    };
    const putCommand = new PutObjectCommand(putParams);
    s3.send(putCommand);

    const getParams: GetObjectCommandInput = {
      Bucket: bucketName,
      Key: file?.filename,
    };
    const getCommand = new GetObjectCommand(getParams);

    const url = await getSignedUrl(s3, getCommand, { expiresIn: 3600 * 24 });

    await fs.unlink(dirName);
    return res.json({
      url,
    });
  }
);

/*
 * DELETE request needs the userId to identify the imageName
 * to delete from S3
 * Uses the DeleteObjectCommand from "@aws-sdk/client-s3"
 */
app.delete("/delete", async (req: Request, res: Response) => {
  const {} = req.body;

  return res.sendStatus(204);
})

app.listen(8080, () => console.log("Server running on port 8080"));
