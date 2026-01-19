const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    paymentId: { type: String, unique: true },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
    },
    orderCode: { type: String, unique: true, sparse: true }, // ✅ harus unique
    grossAmount: { type: Number, required: true }, // ✅ sesuai controller
    currency: { type: String, default: "IDR" },
    status: { type: String, default: "pending" },
    paymentMethod: { type: String, required: true }, // ✅ ubah dari "method"
    customerName: { type: String, default: "Guest" },
    customerPhone: { type: String, default: "-" },
    tableNo: { type: Number },
    tableId: { type: mongoose.Schema.Types.ObjectId, ref: "Table" },

    // Midtrans specific
    snapToken: { type: String },
    midtransResponse: { type: Object },
  },
  {
    timestamps: true,
  }
);

const Payment = mongoose.model("Payment", paymentSchema);
module.exports = Payment;
