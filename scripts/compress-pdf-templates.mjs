import fs from "fs";
import path from "path";
import sharp from "sharp";

const DIR = path.resolve("public/pdf-template");
const MAX_W = 1240; // ~150 dpi A4
const MAX_H = 1754;

const files = fs.readdirSync(DIR).filter((f) => f.toLowerCase().endsWith(".png"));

for (const file of files) {
  const full = path.join(DIR, file);
  const before = fs.statSync(full).size;
  const input = fs.readFileSync(full);
  const meta = await sharp(input).metadata();

  let pipeline = sharp(input).rotate();
  if ((meta.width ?? 0) > MAX_W || (meta.height ?? 0) > MAX_H) {
    pipeline = pipeline.resize(MAX_W, MAX_H, {
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  // Foto a piena pagina: qualità più aggressiva
  const isPhoto = ["azienda.png", "produzione.png", "copertina.png", "retro.png"].includes(
    file,
  );

  const out = isPhoto
    ? await pipeline
        .png({
          compressionLevel: 9,
          adaptiveFiltering: true,
          effort: 8,
          quality: 70,
          palette: true,
        })
        .toBuffer()
    : await pipeline
        .png({ compressionLevel: 9, adaptiveFiltering: true, effort: 8 })
        .toBuffer();

  // Se palette peggiora troppo il peso sulle foto, fallback JPEG rinominato
  let finalBuf = out;
  let finalName = file;
  if (isPhoto && out.length > 900_000) {
    finalBuf = await sharp(input)
      .rotate()
      .resize(MAX_W, MAX_H, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 78, mozjpeg: true })
      .toBuffer();
    finalName = file.replace(/\.png$/i, ".jpg");
  }

  const outPath = path.join(DIR, finalName);
  fs.writeFileSync(outPath, finalBuf);
  if (finalName !== file) fs.unlinkSync(full);

  const after = fs.statSync(outPath).size;
  console.log(
    `${file} → ${finalName}: ${(before / 1e6).toFixed(2)}MB → ${(after / 1e6).toFixed(2)}MB`,
  );
}
