import dotenv from "dotenv";
import express, { Request, Response } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs/promises";
import {
  DeleteObjectCommand,
  DeleteObjectCommandInput,
  GetObjectCommand,
  GetObjectCommandInput,
  PutObjectCommand,
  PutObjectCommandInput,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PrismaClient } from "@prisma/client";
import { v4 as uuid } from "uuid";

import { multerConfig } from "./multerConfig";

dotenv.config();

const bucketRegion = process.env.BUCKET_REGION;
const bucketName = process.env.BUCKET_NAME;
const accessKey = process.env.ACCESS_KEY;
const secretAccessKey = process.env.SECRET_ACCESS_KEY;

const app = express();

const prisma = new PrismaClient();

const s3 = new S3Client({
  credentials: {
    accessKeyId: accessKey!,
    secretAccessKey: secretAccessKey!,
  },
  region: bucketRegion,
});

app.use(express.json());
app.use("/", express.static("./tmp/"));

const avatarUpload = multer(multerConfig);

app.post("/user", async (req: Request, res: Response) => {
  const { name } = req.body;

  const id = uuid();
  const newUser = await prisma.user.create({
    data: {
      id,
      name,
    },
  });

  return res.status(201).json(newUser);
});

app.get("/user", async (req: Request, res: Response) => {
  const users = await prisma.user.findMany();
  res.json(users);
});

/*
 * GET request needs a database to access the imageName
 * saved in the POST request.
 */
app.get("/user/avatar", async (req: Request, res: Response) => {
  const { user_id } = req.body;

  const user = await prisma.user.findUnique({
    where: {
      id: user_id,
    },
  });

  const params: GetObjectCommandInput = {
    Bucket: bucketName,
    Key: user?.avatar!,
  };
  const command = new GetObjectCommand(params);
  const url = await getSignedUrl(s3, command, { expiresIn: 3600 * 24 });

  return res.json({ url });
});

/*
 * Needs to save the imageName with a userId in the database
 */
app.post(
  "/user/avatar/upload",
  avatarUpload.single("avatar"),
  async (req: Request, res: Response) => {
    const { user_id } = req.headers;
    const file = req.file;

    const user = await prisma.user.findUnique({
      where: {
        id: user_id as string,
      },
    });

    if (!user) {
      throw Error("User not found!");
    }

    if (!user.avatar) {
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

      await prisma.user.update({
        where: {
          id: user.id,
        },
        data: {
          avatar: file?.filename!,
        },
      });

      await fs.unlink(dirName);

      return res.json({
        url,
      });
    }
    return res.status(400).json({ message: "user already has an avatar" });
  }
);

/*
 * DELETE request needs the userId to identify the imageName
 * to delete from S3
 * Uses the DeleteObjectCommand from "@aws-sdk/client-s3"
 */
app.delete("/user/avatar/delete", async (req: Request, res: Response) => {
  const { user_id } = req.body;

  const user = await prisma.user.findUnique({
    where: {
      id: user_id,
    },
  });

  const params: DeleteObjectCommandInput = {
    Bucket: bucketName,
    Key: user?.avatar!,
  };
  const command = new DeleteObjectCommand(params);
  await s3.send(command);

  await prisma.user.update({
    where: {
      id: user_id,
    },
    data: {
      avatar: null,
    },
  });

  return res.sendStatus(204);
});

app.listen(8080, () => console.log("Server running on port 8080"));
