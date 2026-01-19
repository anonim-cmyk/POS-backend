const orderService = require("../services/order-service");

// CREATE
const addOrder = async (req, res, next) => {
  try {
    const order = await orderService.addOrder(req.body);
    res.status(201).json({
      success: true,
      message: "Order Created!",
      data: order,
    });
  } catch (error) {
    next(error);
  }
};

// GET BY ID
const getOrderById = async (req, res, next) => {
  try {
    const order = await orderService.getOrderById(req.params.id);
    res.status(200).json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

// GET ALL
const getOrders = async (req, res, next) => {
  try {
    const orders = await orderService.getOrders(req.query);
    res.status(200).json({ success: true, ...orders });
  } catch (error) {
    next(error);
  }
};

// UPDATE
const updateOrder = async (req, res, next) => {
  try {
    const order = await orderService.updateOrder(
      req.params.id,
      req.body.orderStatus
    );
    res
      .status(200)
      .json({ success: true, message: "Order Updated!", data: order });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  addOrder,
  getOrderById,
  getOrders,
  updateOrder,
};
