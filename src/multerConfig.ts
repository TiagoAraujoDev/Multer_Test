import multer from "multer";
import path from "node:path";
import crypto from "node:crypto";

const tmpFolder = path.join(__dirname, "..", "tmp");
console.log(tmpFolder);

export const multerConfig = {
  tmpFolder,
  storage: multer.diskStorage({
    destination: `${tmpFolder}`,
    filename: (req, file, callback) => {
      const fileHash = crypto.randomBytes(16).toString("hex");
      const fileName = `${fileHash}-${file.originalname}`;

      return callback(null, fileName);
    }
  })
};
