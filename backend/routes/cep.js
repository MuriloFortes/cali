import { Router } from "express";
import { lookupCep } from "../services/cep.js";

const router = Router();

// GET /api/cep/:cep
// Busca endereço via ViaCEP (sem dependências externas)
router.get("/:cep", async (req, res) => {
  try {
    const cepDigits = String(req.params?.cep || "");
    const data = await lookupCep(cepDigits);
    res.json(data);
  } catch (err) {
    const msg = err?.message || "Erro ao consultar CEP.";
    const status = msg.includes("não encontrado") ? 404 : 400;
    res.status(status).json({ error: true, message: msg });
  }
});

export default router;

