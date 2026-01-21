const reportService = require("../services/report-service");

const getSalesReport = async (req, res, next) => {
  try {
    const { range = "30d" } = req.query;

    const report = await reportService.getSalesReport(range);

    res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getSalesReport };
