const axios = require("axios");

const chargilyClient = axios.create({
  baseURL: process.env.CHARGILY_BASE_URL,
  headers: {
    Authorization: `Bearer ${process.env.CHARGILY_SECRET_KEY}`,
    "Content-Type": "application/json",
  },
});

const createCheckout = async ({
  amount,
  successUrl,
  failureUrl,
  webhookEndpoint,
  description,
  metadata,
}) => {
  try {
    const response = await chargilyClient.post("/checkouts", {
      amount,
      currency: "dzd",

      payment_method: "edahabia",

      success_url: successUrl,

      failure_url: failureUrl,

      webhook_endpoint: webhookEndpoint,

      description,

      locale: "ar",

      chargily_pay_fees_allocation: "merchant",

      metadata,
    });

    return response.data;
  } catch (error) {
    console.error(
      "Chargily checkout error:",
      error.response?.data || error.message
    );

    throw error;
  }
};

module.exports = {
  createCheckout,
};