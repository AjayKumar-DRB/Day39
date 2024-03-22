const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
const PORT = 3000;

const url = 'mongodb://localhost:27017';
const dbName = 'MentorStudent';

app.use(express.json());

// Function to fetch the latest mentorID from the database
async function getLastMentorID() {
    const client = new MongoClient(url);
    try {
        await client.connect();
        const db = client.db(dbName);
        const mentorsCollection = db.collection('mentors');
        const lastMentor = await mentorsCollection.find().sort({ mentorID: -1 }).limit(1).toArray();
        return lastMentor.length > 0 ? lastMentor[0].mentorID : 0;
    } finally {
        await client.close();
    }
}

// Function to fetch the latest studentID from the database
async function getLastStudentID() {
    const client = new MongoClient(url);
    try {
        await client.connect();
        const db = client.db(dbName);
        const studentsCollection = db.collection('students');
        const lastStudent = await studentsCollection.find().sort({ studentID: -1 }).limit(1).toArray();
        return lastStudent.length > 0 ? lastStudent[0].studentID : 0;
    } finally {
        await client.close();
    }
}

// Create Mentor API
app.post('/mentors', async (req, res) => {
    try {
        const mentorData = req.body;
        
        // Fetch the last mentor ID from the database
        const lastMentorID = await getLastMentorID();
        
        // Increment the last mentor ID to generate a new mentor ID
        const mentorID = lastMentorID + 1;

        const client = new MongoClient(url);
        await client.connect();
        const db = client.db(dbName);
        const mentorsCollection = db.collection('mentors');
        await mentorsCollection.insertOne({ mentorID, ...mentorData });        
        client.close();
        
        // Send the generated mentor ID in the response
        res.json({ message: 'Mentor created', mentorID: mentorID });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create Student API
app.post('/students', async (req, res) => {
    try {
        const studentData = req.body;        
        
        // Fetch the last mentor ID from the database
        const lastStudentID = await getLastStudentID();
        
        // Increment the last mentor ID to generate a new mentor ID
        const studentID = lastStudentID + 1;

        const client = new MongoClient(url);
        await client.connect();
        const db = client.db(dbName);
        const studentsCollection = db.collection('students');
        await studentsCollection.insertOne({studentID, ...studentData});
        client.close();
        res.json({ message: 'Student created', studentId: studentID });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Assign Student to Mentor API
app.put('/mentors/:mentorId/students', async (req, res) => {
    try {
        const mentorId = req.params.mentorId;
        const studentIds = req.body.studentIds;

        //To validate if studentId is valid or not
        if (!studentIds || !Array.isArray(studentIds)) {
            return res.status(400).json({ error: "Invalid studentIds array provided" });
        }

        const client = new MongoClient(url);
        await client.connect();
        const db = client.db(dbName);

        // Check if any of the students already have a mentor
        const studentsCollection = db.collection('students');
        const studentsWithMentors = await studentsCollection.find({ studentID: { $in: studentIds.map(id => Number(id)) }, mentor: { $exists: true } }).toArray();
        console.log(studentsWithMentors)
        if (studentsWithMentors.length > 0) {
            return res.status(400).json({ error: "One or more students already have a mentor" });
        }        

        // Update mentor's studentsTeaching field
        const mentorsCollection = db.collection('mentors');
        const mentorResult = await mentorsCollection.updateOne(
            { mentorID: Number(mentorId) },
            { $addToSet: { studentsTeaching: { $each: studentIds } } }
        );

        // Update students' mentor field
        const studentsResult = await studentsCollection.updateMany(
            { studentID: { $in: studentIds.map(id => Number(id)) } },
            { $set: { mentor: Number(mentorId) } }
        );

        client.close();
        res.json({ 
            message: 'Students assigned to mentor', 
            mentorModifiedCount: mentorResult.modifiedCount,
            studentsModifiedCount: studentsResult.modifiedCount
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Assign or Change Mentor for a Student API
app.put('/students/:studentId/mentor', async (req, res) => {
    try {
        const studentId = req.params.studentId;
        const newMentorId = req.body.mentorId;

        const client = new MongoClient(url);
        await client.connect();
        const db = client.db(dbName);
        const studentsCollection = db.collection('students');

        // Get current mentor and current date
        const student = await studentsCollection.findOne({ studentID: Number(studentId) });
        const currentMentorID = student.mentor;
        const currentDate = new Date();

        //To check if current Mentor and new Mentor are same
        if (currentMentorID === newMentorId){
            return res.status(400).json({ error: "New mentor is same as current mentor" });
        }

        // Update student with new mentor and push current mentor to previousMentors array
        const result = await studentsCollection.updateOne(
            { studentID: Number(studentId) },
            { 
                $set: { mentor: Number(newMentorId) },
                $push: { previousMentors: { mentor: currentMentorID, tillDate: currentDate } }
            }
        );

        client.close();

        res.json({ message: `Mentor changed from ${currentMentorID} to ${newMentorId} for student with ID ${studentId} ` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Show all Students for a Mentor API
app.get('/mentors/:mentorId/students', async (req, res) => {
    try {
        const mentorId = req.params.mentorId;
        const client = new MongoClient(url);
        await client.connect();
        const db = client.db(dbName);
        const studentsCollection = db.collection('students');
        const students = await studentsCollection.find({ mentor: Number(mentorId) }, { projection: { _id: 0, studentID: 1, studentName: 1, mentor: 1 }}).toArray();
        client.close();
        res.json(students);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Show Previously Assigned Mentor for a Student API
app.get('/students/:studentId/mentor', async (req, res) => {
    try {
        const studentId = Number(req.params.studentId);
        const client = new MongoClient(url);
        await client.connect();
        const db = client.db(dbName);
        const studentsCollection = db.collection('students');
        const student = await studentsCollection.findOne({ studentID: studentId });
        client.close();
        res.json({ previousMentor: student.previousMentors });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
