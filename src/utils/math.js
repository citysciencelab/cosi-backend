import * as d3 from "d3-array";

/**
 * Determines whether all values are numbers
 * @param {*} values - all number values
 * @returns {Boolean} are all numbers?
 */
function assertValues (...values) {
    for (const v of values) {
        if (typeof v !== "number") {
            return false;
        }
    }

    return true;
}

/**
 * Calculates the median for a given sample
 * @param {Number[]} data The array of existing values
 * @returns {Number} the median
 */
export function median (data) {
    if (!assertValues(...data)) {
        return undefined;
    }
    const sortData = data.sort(),
        mid = Math.ceil(sortData.length / 2);

    return sortData.length % 2 === 0 ? (sortData[mid] + sortData[mid - 1]) / 2 : sortData[mid - 1];
}

/**
 * Calculates the mean for a given sample
 * @param {Number[]} data The array of existing values
 * @returns {Number} the mean
 */
export function mean (data) {
    if (!assertValues(...data)) {
        return undefined;
    }
    return data.reduce((total, datum) => total + datum, 0) / data.length;
}

/**
 * adds a and b
 * @param {Number} a - a
 * @param {Number} b - b
 * @returns {Number} the result
 */
export function add (a, b) {
    if (!assertValues(a, b)) {
        return undefined;
    }
    return a + b;
}

/**
 * subtracts a and b
 * @param {Number} a - a
 * @param {Number} b - b
 * @returns {Number} the result
 */
export function subtract (a, b) {
    if (!assertValues(a, b)) {
        return undefined;
    }
    return a - b;
}

/**
 * Multiplies a and b
 * @param {Number} a - a
 * @param {Number} b - b
 * @returns {Number} the result
 */
export function multiply (a, b) {
    if (!assertValues(a, b)) {
        return undefined;
    }
    return a * b;
}

/**
 * Divides a and b
 * @param {Number} a - a
 * @param {Number} b - b
 * @returns {Number} the result
 */
export function divide (a, b) {
    if (!assertValues(a, b)) {
        return undefined;
    }
    return a / b;
}

/**
 * Sums up a list of numbers
 * @param {Number[]} arr - array of numbers
 * @returns {Number} the result
 */
export function sum (arr) {
    if (!assertValues(...arr)) {
        return undefined;
    }
    return arr.reduce((res, e) => res + e, 0);
}

/**
 * Computes the difference between concordant and discordant observation pairs in X and Y
 * Does not elegantly handle ties
 * @param {Number[]} arrX - the x-Axis values
 * @param {Number[]} arrY - the y-Axis values
 * @returns {Number} the difference
 */
export function diffConDis (arrX, arrY) {
    const n = arrX.length;
    let nc = 0,
        nd = 0;

    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            if (i === j) {
                continue;
            }
            if ((arrX[i] - arrX[j] > 0) === (arrY[i] - arrY[j] > 0)) {
                nc++;
            }
            else {
                nd++;
            }
        }
    }

    return nc - nd;
}

/**
 * Computes the covariance between random variable observations
 * @param {Number[]} arrX - the x-Axis values
 * @param {Number[]} arrY - the y-Axis values
 * @returns {Number} the covariance
 */
export function covar (arrX, arrY) {
    const u = d3.mean(arrX),
        v = d3.mean(arrY),
        arrXLen = arrX.length,
        sq_dev = new Array(arrXLen);

    for (let i = 0; i < arrXLen; i++) {
        sq_dev[i] = (arrX[i] - u) * (arrY[i] - v);
    }

    return d3.sum(sq_dev) / (arrXLen - 1);
}

/**
 * Compute Pearson's correlation coefficient
 * @param {Number[]} arrX - the x-Axis values
 * @param {Number[]} arrY - the y-Axis values
 * @returns {Number} the pearson's coefficient
 */
export function pearsons (arrX, arrY) {
    const num = covar(arrX, arrY),
        denom = d3.deviation(arrX) * d3.deviation(arrY);

    return num / denom;
}

/**
 * Kendall's tau-a (does not handle tie breaking)
 * @param {Number[]} arrX - the x-Axis values
 * @param {Number[]} arrY - the y-Axis values
 * @returns {Number} Kendall's tau-a
 */
export function kendalls (arrX, arrY) {
    const n = arrX.length;

    return diffConDis(arrX, arrY) / (n * (n - 1) / 2);
}

/**
 * Standard Error for y and yEst
 * @param {Number} y0 - the y value
 * @param {Number} y1 - the estimated y Value
 * @returns {Number} adds the standard deviation to a data set
 */
export function standardError (y0, y1) {
    return Math.pow(y0 - y1, 2);
}

/**
 * Computes the standard deviation from the regression line for each value and in total
 * @param {{x: Number, y: Number, yEst: Number, stdDev: Number}[]} data - the data set
 * @param {Number[]} yEstArr - the estimated y values
 * @returns {Number[]} the standard deviation
 */
export function stdDev (data, yEstArr) {
    const res = [];
    let stdErr;

    for (let i = 0; i < data.length; i++) {
        stdErr = standardError(data[i].y, yEstArr[i]);
        res.push(stdErr);

        // add values to dataset
        data[i].stdDev = stdErr;
    }

    return res;
}

/**
 * Computes the estimated value from the regression function for each value and in total
 * @param {{x: Number, y: Number, yEst: Number, stdDev: Number}[]} data - the data set
 * @param {Function} fReg - the regression function
 * @returns {Number[]} the estimated y values
 */
export function yEst (data, fReg) {
    let y;
    const res = [];

    for (const d of data) {
        y = fReg(d.x);
        res.push(y);

        // add values to dataset
        d.yEst = y;
    }

    return res;
}

/**
 * Computes the linear regression line from a given data set
 * adds the est. value to each item
 * @param {Number[]} xArr - the x data
 * @param {Number[]} yArr - the y data
 * @returns {Function} the regression function
 */
export function linearRegression (xArr, yArr) {
    let xr, yr,
        term1 = 0,
        term2 = 0,
        a = 0,
        b = 0;
    const xMean = mean(xArr),
        yMean = mean(yArr);

    // calculate coefficients
    for (let i = 0; i < xArr.length; i++) {
        xr = xArr[i] - xMean;
        yr = yArr[i] - yMean;
        term1 += xr * yr;
        term2 += xr * xr;
    }

    a = term1 / term2;
    b = yMean - (a * xMean);

    return (x) => a * x + b;
}

/**
 * interpolates a set of points for a given x with lagrange interpolation
 * @param {*} x - the value
 * @param {*} xArr - the x values
 * @param {*} yArr - the y values
 * @returns {number} the exp value
 */
export function interpolate (x, xArr, yArr) {
    const k = xArr.length;

    /**
     * The lagrange base function
     * @param {Number} j - the current index
     * @returns {Number} the base
     */
    function _basis (j) {
        const p = new Array(k).fill(0)
            .map((v, m) => m !== j ? (x - xArr[m]) / (xArr[j] - xArr[m]) : null)
            .filter(v => v !== null);

        return p.reduce((res, v) => res * v, 1);
    }

    return new Array(k).fill(0).map((v, j) => _basis(j) * yArr[j]).reduce((res, v) => res + v, 0);
}

export default {
    add,
    subtract,
    multiply,
    divide,
    sum,
    standardError,
    covar,
    pearsons,
    kendalls,
    diffConDis,
    linearRegression,
    yEst,
    stdDev,
    mean,
    median
};


