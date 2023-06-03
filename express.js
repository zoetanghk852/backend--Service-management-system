
const express = require("express");
const app = express();
const port = 8001;

const mysql = require("mysql2");
let pool = null;

const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const jwtSecret = "Secret";
const saltRounds = 12;


const multer = require("multer");
const storage = multer.diskStorage({
  destination: "./upload-files",
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  },
});

const upload = multer({ storage: storage });

app.use(express.json());
app.use(express.static("public"));
app.use("/img", express.static("upload-files"));

//register 1 
app.post("/register", async (req, res) => {
  let { username, password } = req.body;
  const [user] = await pool.execute(
    `select userName from member where userName=?`,
    [username]
  );

  if(user.length === 0 ){
    if(username && password){
      const hashedPassword = await bcrypt.hash(password, saltRounds);
      await pool.execute("INSERT INTO member(userName , password) VALUES(?,?)", [
        username,
        hashedPassword
      ]);
      return res.json({ success: true });

    }else {
    return res.json({ success: false, message: "Please enter username or password." });
    }
  }else{
    return res.json({ success: false, message: "user is already token,Please use another username." });
  }
});

//login 2 
app.post("/login", async (req, res) => {
  let username = req.body.username;
  let password = req.body.password;

  const [data] = await pool.execute(
    "select userName,password from member where userName = ? ",
    [username]
  );


  if (data.length === 0 ) {
    return res.json({
      success: false,
      message: "Wrong username or password",
    });
  } else if (data[0].userName.length > 0) {

    const [id] = await pool.execute("SELECT id FROM member where userName = ?", [
      username
    ]);
    let user_id = id[0].id;

    bcrypt.compare(password, data[0].password).then((result) => {
      if (result) {
        const payload = { id:user_id,username: username };
        const token = jwt.sign(payload, jwtSecret, { expiresIn: 1200000 });
        res.json({
          message: "Successful logged in",
          success: true,
          // token: token,
          
        });
      } else {
        return res.json({
          success: false,
          message: "Wrong username or password ",
        });
      }
    });
  } 
});

//logout 3 
app.post("/logout", (req, res) => {
  res.json({ message: "logout!" });
});

//4
function auth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.split(" ")[1];
    jwt.verify(token, jwtSecret, (err, decoded) => {
      if (err) {
        res.status(401).json({
          success: false,
        });
      } else {
        req.userInfo = decoded;
        next();
      }
    });
  } else {
    return res.status(401).json({
      success: false,
    });
  }
}

//service-menu 5 6 
app.get("/service-menu", async (req, res) => {
  let inputService = req.query.serviceName;
  if (inputService === undefined) {
    const [data] = await pool.execute(
      "SELECT service_id,serviceName,service_ower,description from service where availability = true"
    );
    return res.json(data);
  } else {
    const [result] = await pool.execute(
      "SELECT service_id,serviceName,service_ower,description FROM service where serviceName like ? ",
      [`%${inputService}%`]
    );
    // console.log(result);

    if (result.length === 0) {
      return res.json({ message: "input not found" });
    } else {
      return res.json(result);
    }
  }
});

//detail 7 
app.get("/service-menu/detail", async (req, res) => {
  let inputService = req.query.serviceName;

  const [data] = await pool.execute(
    "SELECT * FROM service where serviceName like ? ",
    [`%${inputService}%`]
  );

  if (data.length === 0) {
    return res.json({ success: false});
  } else {
    return res.json({ success: true,Service:data});
  }
});

//create service 8 
app.post("/member/service", auth, async (req, res) => {
  let user_id = req.userInfo.id;
  let { serviceName, description } = req.body;
  let likeCount = 0;
  let bookedById = 0;
  let availability = true; 

  if(serviceName&&description){
    const [result] = await pool.execute(
    "INSERT INTO service (serviceName,service_ower,description,likeCount,bookedById,availability) VALUES(?,?,?,?,?,?)",
    [serviceName, user_id, description, likeCount, bookedById, availability]
    );
    // console.log(result);

    return res.json({
      success: true,
      message: "create service done!"
    });

  }else{
    return res.json({ success:false});
  }

});
  
//likeCount 11 
app.post("/service/:serviceId/like", auth, async (req, res) => {
  let serviceId = req.params.serviceId;
  let updateLike;
  const [data] = await pool.execute(
    "SELECT likeCount from service WHERE service_id =?",
    [serviceId]
  );
  console.log(data);

  if (data.length === 0) {
    return res.json({ success: false,message: "service not found" });
  } else {
    updateLike = data[0].likeCount + 1;
    await pool.execute("UPDATE service SET likeCount = ? WHERE service_id = ?", [
      updateLike,
      serviceId,
    ]);
    return res.json({ success: true });
  }
});

//delete service by creator 10 
app.delete("/service/:serviceId", auth, async (req, res) => {
  let serviceId = req.params.serviceId;
  let user_id = req.userInfo.id;
  
  //search service_ower
  const [data] = await pool.execute(
    "SELECT service_ower FROM service WHERE service_id = ?",
    [serviceId]
  );
  console.log(data);

  if (data.length === 0) {
    return res.json({ message: "service not found" });
  } else if (data[0].service_ower !== user_id) {
    return res.json({ message: "wrong user" });
  } else {
    await pool.execute("DELETE from service WHERE service_id = ?", [serviceId]);
    return res.json({ message: "deleted service" });
  }
});

//book service 13 
app.post("/service/:serviceId/book", auth, async (req, res) => {
  let serviceId = req.params.serviceId;
  let user_id = req.userInfo.id; 
  let updateAvailability = false; 
  let updateBooked_status = "join";

  const [data] = await pool.execute(
    "SELECT service_ower,availability from service where service_id = ?",
    [serviceId]
  );
  console.log(data);

  if (data.length === 0 ) {
    return res.json({success: false, message: "service not found" });
  } else if (data[0].service_ower === user_id) {
    return res.json({success: false, message: "You cannot book your own service" });
  }else if(data[0].availability === 0){
    return res.json({success: false, message: "service have already booked" });
  }else {
    await pool.execute(
      "UPDATE service SET bookedById=?,availability=? WHERE service_id = ?",
      [user_id, updateAvailability, serviceId]
    );
    
    await pool.execute(
      "INSERT INTO booking_record(bookby_Id,eventId,booked_status) VALUES(?,?,?)", 
      [
        user_id,
        serviceId,
        updateBooked_status
      ]
    );
    return res.json({success: true, message: "Successful booked service" });
  }
});

//update photo 9
    
app.patch("/service/:serviceId/photo",auth,upload.array("photo", 12),async (req, res) => {
    let serviceId = req.params.serviceId;
    let user_id = req.userInfo.id;
    let update_photo=req.files;

    
    if(update_photo.length >0){
      
      for(let i = 0 ; i<req.files.length ; i++){
        const result = await pool.execute(
          "INSERT INTO picture (pic,pic_userID,serviceId) VALUES(?,?,?)",
          [update_photo[i].filename, user_id,serviceId]
        )
        console.log("result",result);
      }
      
      res.json({success: true, message: "updated"});
    }else{
      res.json({success: false});
    }
    
    //one photo
    // const [result] = await pool.execute(
    //   "INSERT INTO picture (pic,pic_user,pic_service) VALUES(?,?,?)",
    //   [update_photo, user_id,serviceId]
    // );

    // if (data[0].serviceOwner === username) {
    //   res.json({ success: true, message: "updated" });
    // } else {
    //   res.json({ success: false });
    // }

    // if (data) {
    //   pictures.push(`img/${req.file.originalname}`);
    //   console.log(pictures);
    // }
  }
);

//updateInfo 10
app.patch("/service/:serviceId/updateInfo", auth, async (req, res) => {
  let serviceId = req.params.serviceId;
  let updateDescription = req.body.description;
  let user_id = req.userInfo.id;

  const [data] = await pool.execute(
    "SELECT service_ower from service where service_id = ?",
    [serviceId]
  );
  
  if (data.length === 0) {
    return res.json({ success: false, message: "service not found" });
  } else if (data[0].service_ower !== user_id) {
    return res.json({ success: false, message: "wrong user" });
  } else {
    await pool.execute("UPDATE service SET description=? WHERE service_id = ?", [
      updateDescription,
      serviceId,
    ]);
    return res.json({ success: true, message: "updated successfully" });
  }
});

//comment 12 
app.post("/service/:serviceId/comments", auth, async (req, res) => {
  let serviceId = req.params.serviceId;
  let updateComment = req.body.comment;
  let user_id = req.userInfo.id;

  const [data] = await pool.execute(
    "SELECT service_id,serviceName from service where service_id = ?",
    [serviceId]
  );

  if (data.length !== 0) {
    await pool.execute(
      "INSERT INTO comments (author_id,serviceId,comment) VALUES(?,?,?)",
      [user_id, serviceId, updateComment]
    );
    return res.json({ success: true, message: "found" });
  } else {
    return res.json({ success: false, message: "services not found" });
  }
});

//14 remove bookBy 
app.post("/service/:serviceId/removeBooking", auth, async (req, res) => {
  let serviceId = req.params.serviceId;
  let user_id = req.userInfo.id;
  let updateId = 0;
  let updateAvailability = true;
  let updateBooked_status = "leave";

  const [data] = await pool.execute(
    "SELECT service_id,serviceName,bookedById FROM service where service_id = ?",
    [serviceId]
  );

  if (data.length === 0) {
    res.json({ success: false, message: "service not found" });
  } else if (data[0].bookedById != user_id) {
    res.json({ success: false, message: "can't remove service booking" });
  } else if (data[0].bookedById === user_id) {
    await pool.execute(
      "UPDATE service SET bookedById =?,availability=? WHERE service_id = ?",
      [updateId, updateAvailability, serviceId]
    );
    await pool.execute(
      "UPDATE booking_record SET booked_status= ? where eventId=? ",
      [updateBooked_status, serviceId]
    );
    res.json({ success: true, message: "removed booking" });
  }
});

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.use("*", (req, res) => {
  res.status(404).json({ success: false, message: "Page not found" });
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
  pool = mysql
    .createPool({
      host: process.env.HOST,
      port: process.env.PORT,
      user: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASSWORD,
      database: process.env.DATABASE
    })
    .promise();
});



