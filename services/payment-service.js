const midtransClient = require("midtrans-client");
const Payment = require("../models/paymentModel");
const Table = require("../models/tableModel");
const Order = require("../models/orderModel");
const createHttpError = require("http-errors");

// 🔹 Midtrans init
const snap = new midtransClient.Snap({
  isProduction: false,
  serverKey: process.env.MIDTRANS_SERVER_KEY,
});

const core = new midtransClient.CoreApi({
  isProduction: false,
  serverKey: process.env.MIDTRANS_SERVER_KEY,
});

// ===============================
// 🟡 CREATE PAYMENT
// ===============================
const createPayment = async (payload) => {
  const {
    order_id,
    tableNo,
    tableId,
    gross_amount,
    customer_name,
    customer_phone,
    method,
  } = payload;

  console.log("CREATE PAYMENT:", method, order_id);

  if (!order_id || !gross_amount || !method) {
    throw createHttpError(400, "Missing required fields");
  }

  const existingPayment = await Payment.findOne({ orderCode: order_id });
  if (existingPayment) {
    return {
      payment: existingPayment,
      snapToken: existingPayment.snapToken,
    };
  }

  const normalizeMethod = method.toLowerCase();

  if (normalizeMethod === "cash" && tableId) {
    await Table.findByIdAndUpdate(tableId, { status: "Booked" });
  }
  const payment = new Payment({
    orderCode: order_id,
    tableNo,
    tableId,
    paymentMethod: normalizeMethod,
    grossAmount: gross_amount,
    customerName: customer_name || "Guest",
    customerPhone: customer_phone || "-",
    status: method === "cash" ? "success" : "pending",
  });

  await payment.save();

  if (normalizeMethod === "online") {
    const amount = Number(gross_amount);
    if (!amount || isNaN(amount)) {
      throw createHttpError(400, "Invalid gross_amount");
    }

    const transaction = await snap.createTransaction({
      transaction_details: {
        order_id: payment.orderCode,
        gross_amount: amount,
      },
      customer_details: {
        first_name: customer_name || "Guest",
        phone: customer_phone || "-",
      },
    });

    payment.snapToken = transaction.token;
    payment.midtransResponse = transaction;
    await payment.save();

    return {
      payment,
      snapToken: payment.snapToken,
    };
  }

  return {
    payment,
  };
};

// ===============================
// 🟢 VERIFY PAYMENT
// ===============================
const verifyPayment = async (order_id) => {
  if (!order_id) {
    throw createHttpError(400, "order_id required");
  }

  const statusResponse = await core.transaction.status(order_id);

  let newStatus = "pending";
  if (
    statusResponse.transaction_status === "capture" &&
    statusResponse.fraud_status === "accept"
  ) {
    newStatus = "success";
  } else if (statusResponse.transaction_status === "settlement") {
    newStatus = "success";
  } else if (
    ["cancel", "deny", "expire"].includes(statusResponse.transaction_status)
  ) {
    newStatus = "failed";
  }

  const updatedPayment = await Payment.findOneAndUpdate(
    { orderCode: order_id },
    { status: newStatus },
    { new: true }
  );

  if (!updatedPayment) {
    throw createHttpError(404, "Payment not found");
  }

  return {
    ...statusResponse,
    appStatus: newStatus,
  };
};

// ===============================
// 🔔 WEBHOOK
// ===============================
const handleWebhook = async (notification) => {
  const statusResponse = await core.transaction.notification(notification);

  let newStatus = "pending";
  if (
    statusResponse.transaction_status === "capture" &&
    statusResponse.fraud_status === "accept"
  ) {
    newStatus = "success";
  } else if (statusResponse.transaction_status === "settlement") {
    newStatus = "success";
  } else if (
    ["cancel", "deny", "expire"].includes(statusResponse.transaction_status)
  ) {
    newStatus = "failed";
  }

  const updatedPayment = await Payment.findOneAndUpdate(
    { orderCode: statusResponse.order_id },
    { status: newStatus },
    { new: true }
  );

  if (!updatedPayment) {
    throw createHttpError(404, "Payment not found");
  }

  if (newStatus === "success" && updatedPayment.tableId) {
    await Table.findByIdAndUpdate(updatedPayment.tableId, {
      status: "Booked",
    });
  }

  if (newStatus === "success") {
    const order = await Order.findOne({
      orderCode: updatedPayment.orderCode,
    });

    if (order && order.orderStatus !== "Completed") {
      order.orderStatus = "Completed";
      await order.save();
    }
  }

  return true;
};

const getPayments = async (queryParams = {}) => {
  const { page = 1, limit = 10, status, period } = queryParams;
  const filter = {};

  if (status) {
    filter.status = status;
  }

  if (period) {
    const now = new Date();
    let startDate;

    switch (period) {
      case "week":
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case "month":
        startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case "year":
        startDate = new Date();
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      default:
        startDate = null;
    }

    if (startDate) {
      filter.createdAt = { $gte: startDate };
    }
  }

  const skip = (page - 1) * limit;

  const [payments, totalRecords] = await Promise.all([
    Payment.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    Payment.countDocuments(filter),
  ]);

  const totalAmountResult = await Payment.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        total: { $sum: "$grossAmount" },
      },
    },
  ]);

  const totalAmount = totalAmountResult[0]?.total || 0;

  const totalPages = Math.ceil(totalRecords / limit);

  return {
    payments,
    totalPages,
    totalAmount,
    currentPage: parseInt(page),
    totalRecords,
  };
};

module.exports = {
  createPayment,
  verifyPayment,
  handleWebhook,
  getPayments,
};
