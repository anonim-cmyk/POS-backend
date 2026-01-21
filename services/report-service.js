// services/report.service.js
const Order = require("../models/orderModel");
const Payment = require("../models/paymentModel");

const getDateRange = (range = "30d") => {
  const now = new Date();
  const from = new Date(now);

  switch (range) {
    case "7d":
      from.setDate(now.getDate() - 7);
      break;
    case "30d":
      from.setDate(now.getDate() - 30);
      break;
    case "month":
      from.setDate(1);
      break;
    case "year":
      from.setMonth(0, 1);
      break;
    default:
      from.setDate(now.getDate() - 30);
  }

  return { from, to: now };
};

const getSalesReport = async (range) => {
  const { from, to } = getDateRange(range);

  /* =====================
     SUMMARY / KPI
  ====================== */

  const [paymentSummary] = await Payment.aggregate([
    {
      $match: {
        status: "success",
        createdAt: { $gte: from, $lte: to },
      },
    },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: "$amount" },
        totalPayments: { $sum: 1 },
      },
    },
  ]);

  const totalOrders = await Order.countDocuments({
    createdAt: { $gte: from, $lte: to },
  });

  const completedOrders = await Order.countDocuments({
    orderStatus: "completed",
    createdAt: { $gte: from, $lte: to },
  });

  const completionRate =
    totalOrders > 0 ? Math.round((completedOrders / totalOrders) * 100) : 0;

  const avgOrderValue =
    completedOrders > 0
      ? Math.round((paymentSummary?.totalRevenue || 0) / completedOrders)
      : 0;

  /* =====================
     REVENUE BY PAYMENT
  ====================== */

  const revenueByMethod = await Payment.aggregate([
    {
      $match: {
        status: "success",
        createdAt: { $gte: from, $lte: to },
      },
    },
    {
      $group: {
        _id: "$paymentMethod",
        total: { $sum: "$amount" },
      },
    },
  ]);

  /* =====================
     TOP SELLING ITEMS
  ====================== */

  const topItems = await Order.aggregate([
    {
      $match: {
        orderStatus: "completed",
        createdAt: { $gte: from, $lte: to },
      },
    },
    { $unwind: "$items" },
    {
      $group: {
        _id: "$items.name",
        qty: { $sum: "$items.qty" },
        revenue: {
          $sum: { $multiply: ["$items.price", "$items.qty"] },
        },
      },
    },
    { $sort: { qty: -1, revenue: -1, _id: -1 } },
    { $limit: 5 },
  ]);

  /* =====================
     REVENUE TREND
  ====================== */

  const revenueTrend = await Payment.aggregate([
    {
      $match: {
        status: "success",
        createdAt: { $gte: from, $lte: to },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
        },
        revenue: { $sum: "$amount" },
        transactions: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  /* =====================
     FINAL RESPONSE
  ====================== */

  return {
    range,
    period: { from, to },
    summary: {
      totalRevenue: paymentSummary?.totalRevenue || 0,
      totalOrders,
      completedOrders,
      completionRate,
      avgOrderValue,
    },
    revenueByMethod,
    topItems,
    revenueTrend,
  };
};

module.exports = {
  getSalesReport,
};
