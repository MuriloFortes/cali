function formatCep(cepDigits) {
  const d = String(cepDigits).replace(/\D/g, "").slice(0, 8);
  if (d.length !== 8) return "";
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

/**
 * Consulta CEP no ViaCEP (https://viacep.com.br)
 * @param {string} cepDigits CEP com 8 dígitos (sem pontuação)
 * @returns {Promise<{zip:string, street:string, neighborhood:string, city:string, state:string}>}
 */
export async function lookupCep(cepDigits) {
  const cep = String(cepDigits).replace(/\D/g, "");
  if (cep.length !== 8) {
    throw new Error("CEP inválido (8 dígitos).");
  }

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 5000);

  try {
    const url = `https://viacep.com.br/ws/${cep}/json/`;
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Falha ao consultar CEP (${res.status}).`);
    }

    const data = await res.json();

    if (!data || data.erro) {
      throw new Error("CEP não encontrado.");
    }

    return {
      zip: formatCep(cep),
      street: data.logradouro || "",
      neighborhood: data.bairro || "",
      city: data.localidade || "",
      state: data.uf || "",
    };
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new Error("Tempo esgotado ao consultar CEP.");
    }
    throw new Error(err?.message || "Erro ao consultar CEP.");
  } finally {
    clearTimeout(t);
  }
}

