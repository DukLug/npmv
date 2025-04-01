import express from 'express'
import data from './data.js'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand, DeleteCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'; // Thêm S3Client
import dotenv from 'dotenv'
import multer from 'multer'; // Thêm multer để xử lý file upload
import path from 'path';

const PORT = 3000;
const app = express();

dotenv.config();

let courses = data

const upload = multer({
    storage: multer.memoryStorage(), // Lưu file tạm thời trong bộ nhớ trước khi upload lên S3
    limits: 1024 * 1024 * 10
});

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});


const client = new DynamoDBClient({
    region: process.env.AWS_REGION,
})

const docClient = DynamoDBDocumentClient.from(client);

const tableName = "courses";
const bucketName = process.env.S3_BUCKET_NAME;
const cloudfrontDomain = process.env.CLOUDFRONT_DOMAIN;

app.use(express.urlencoded({ extended: true }));
app.use(express.static('./views'));

app.set('view engine', 'ejs');
app.set('views', './views');

app.get('/', async(req, res) => {

    try {
        const command = new ScanCommand({ TableName: tableName });
        const data = await docClient.send(command);

        res.render("index", { courses: data.Items });
    } catch (err) {
        console.error("Lỗi:", err);
        res.status(500).send("Internal Server Error");
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});



app.post('/save', upload.single('image'), async(req, res) => {
    const id = Number(req.body.id);
    const name = req.body.name;
    const course_type = req.body.course_type;
    const semester = req.body.semester;
    const department = req.body.department;
    let imageUrl = '';

    console.log(req)
    console.log(req.file)

    if (req.file) {
        const fileName = `${Date.now()}-${req.file.originalname.toLowerCase()}`; // Tạo tên file duy nhất
        const params = {
            Bucket: bucketName,
            Key: fileName,
            Body: req.file.buffer, // Dữ liệu file từ multer
            ContentType: req.file.mimetype, // Loại file (ví dụ: image/jpeg)
        };

        console.log(req.file.originalname.toLowerCase())

        try {
            // Upload file lên S3
            await s3Client.send(new PutObjectCommand(params));
            // Tạo URL công khai của ảnh
            imageUrl = `https://${cloudfrontDomain}/${fileName}`;
        } catch (error) {
            console.error("Lỗi khi upload ảnh lên S3:", error);
            return res.status(500).send("Lỗi khi upload ảnh");
        }
    }

    // Lưu thông tin vào DynamoDB, bao gồm URL của ảnh
    const putParams = new PutCommand({
        TableName: tableName,
        Item: {
            "id": Number(id),
            "name": name,
            "course_type": course_type,
            "semester": semester,
            "department": department,
            "image": imageUrl || '', // Lưu URL ảnh (nếu có)
        },
    });

    try {
        await docClient.send(putParams);
        res.redirect("/");
    } catch (error) {
        console.error("Lỗi khi thêm dữ liệu:", error);
        res.status(500).send("Lỗi server");
    }

    // return res.redirect('/');
});

app.post('/delete', async(req, res) => {
    const { id } = req.body;
    const params = new DeleteCommand({
        TableName: tableName,
        Key: {
            "id": Number(id), // Xóa sản phẩm theo mã sản phẩm
        },
    });
    try {
        await docClient.send(params);
        res.redirect("/");
    } catch (error) {
        console.error("Lỗi khi xóa dữ liệu:", error);
        res.status(500).send("Lỗi server");
    }
});