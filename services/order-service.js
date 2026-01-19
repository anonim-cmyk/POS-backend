const mongoose = require("mongoose");
const Order = require("../models/orderModel");
const Dish = require("../models/dishModel");
const Table = require("../models/tableModel");
const createHttpError = require("http-errors");

const addOrder = async (payload) => {
  const { items, table, orderCode } = payload;

  if (!orderCode) {
    throw createHttpError(400, "orderCode is required");
  }

  const existingOrder = await Order.findOne({ orderCode });
  if (existingOrder) {
    throw createHttpError(400, "Order with this code already exists");
  }

  // Stock validation
  for (const item of items) {
    const dish = await Dish.findById(item.dishId);
    if (!dish) {
      throw createHttpError(404, `Dish not found: ${item.dishId}`);
    }
    if (dish.stock < item.quantity) {
      throw createHttpError(400, `Not enough stock for ${dish.name}`);
    }
    dish.stock -= item.quantity;
    await dish.save();
  }

  const order = new Order({
    ...payload,
    orderCode,
  });

  await order.save();

  if (table) {
    await Table.findByIdAndUpdate(table, {
      status: "Booked",
      currentOrder: order._id,
    });
  }

  return order;
};

const getOrderById = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw createHttpError(404, "Invalid Id!");
  }

  const order = await Order.findById(id);
  if (!order) {
    throw createHttpError(404, "Order Not Found!");
  }

  return order;
};

const getOrders = async ({
  status,
  period,
  search,
  page = 1,
  limit = 10,
} = {}) => {
  const query = {};

  // 🔹 Filter status
  if (status) {
    query.orderStatus = status;
  }

  // 🔹 Filter period
  if (period) {
    const now = new Date();
    let startDate;

    if (period === "weekly") {
      startDate = new Date();
      startDate.setDate(now.getDate() - 7);
    }

    if (period === "monthly") {
      startDate = new Date();
      startDate.setMonth(now.getMonth() - 1);
    }

    if (period === "yearly") {
      startDate = new Date();
      startDate.setFullYear(now.getFullYear() - 1);
    }

    if (startDate) {
      query.createdAt = { $gte: startDate };
    }
  }

  // search
  if (search) {
    query.$or = [
      {
        "customerDetails.name": { $regex: search, $options: "i" },
      },
      {
        orderCode: { $regex: search, $options: "i" },
      },
    ];
  }
  // 🔹 Pagination
  const skip = (Number(page) - 1) * Number(limit);

  const [orders, total] = await Promise.all([
    Order.find(query)
      .populate("table")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Order.countDocuments(query),
  ]);

  return {
    data: orders,
    meta: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const updateOrder = async (id, orderStatus) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw createHttpError(404, "Invalid Id!");
  }

  const order = await Order.findByIdAndUpdate(
    id,
    { orderStatus },
    { new: true }
  ).populate("table");

  if (!order) {
    throw createHttpError(404, "Order Not Found!");
  }

  if (orderStatus === "Completed" && order.table?._id) {
    await Table.findByIdAndUpdate(order.table._id, {
      status: "Available",
    });
  }

  return order;
};

module.exports = {
  addOrder,
  getOrderById,
  getOrders,
  updateOrder,
};
