"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const mongoose_1 = __importDefault(require("mongoose"));
const index_1 = require("../index");
// Mock mongoose
jest.mock('mongoose', () => {
    const actualMongoose = jest.requireActual('mongoose');
    return {
        ...actualMongoose,
        connect: jest.fn().mockResolvedValue({}),
        connection: {
            on: jest.fn(),
            once: jest.fn(),
        },
        disconnect: jest.fn().mockResolvedValue({}),
    };
});
// Mock Summary model
jest.mock('../models/Summary', () => ({
    Summary: {
        find: jest.fn(),
        findOne: jest.fn(),
    },
}));
describe('Summary Routes', () => {
    afterAll(async () => {
        await mongoose_1.default.disconnect();
    });
    it('GET /api/summaries/document/:documentId - should return 401 if unauthorized', async () => {
        const response = await (0, supertest_1.default)(index_1.app).get('/api/summaries/document/doc123');
        expect(response.status).toBe(401);
    });
});
