import express from "express";

const app = express();

app.get("/healthz", (_req, res) => res.status(200).send("ok"));

app.get("/run", (_req, res) => {
  res.status(200).json({ ok: true, message: "Daily run placeholder" });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
