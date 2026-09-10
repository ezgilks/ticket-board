import express from "express";

const app = express();
const PORT = 3000;

app.get("/health", (req, res) => {
    res.json({status: "ok"});
});

app.listen(PORT, () => {
    console.log(`API listening on hhtp://localhost:${PORT}`);
});