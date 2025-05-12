import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { User } from "../models/user.model.js";
import { cloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
const registeruser=asyncHandler(async(req,res)=>{
   //get user details from frontend

    const {username,fullName,email,password}=req.body
    console.log("email :",email)

   //validation -not empty

   if (
    [fullName,username,email,password].some((field)=>field?.trim()==="")
   ) {
        throw new ApiError(400,"All fields are required")
   }

   //check user is already exits: email or username

   const existedUser=User.findOne({
    $or: [{username},{email}]
   })
   if(existedUser)
   {
    throw new ApiError(409,"user with username or email already exists")
   }

   //check for avatar,check for images

   const avatarLocalPath=req.files?.avatar[0]?.path;
   const coverImageLocalPath=req.files?.coverImage[0]?.path;

   if(!avatarLocalPath)
   {
    throw new ApiError(400,"Avatar file is requied")
   }
   //upload them to cloudinary,avatar

   const avatar= await cloudinary(avatarLocalPath)
   const coverImage= await cloudinary(coverImageLocalPath)
   if(!avatar)
   {
    throw new ApiError(400,"Avatar file is requied")
   }
   // create user object -create entry in db
   const user =await User.create({
    fullName,
    avatar:avatar.url,
    coverImage:coverImage?.url||"",
    email,
    password,
    username:username.toLowerCase()
   })

   
   //remove password and refresh token  field from response
   const createdUser=await User.findById(user._id).select(
    "-password -refreshToken"
   )
  
   // check for user creation
    if(!createdUser)
   {
    throw new ApiError(500,"Something went wrong while registering the user")
   }
   //  return res
   return res.status(201).json(
    new ApiResponse(201,createdUser,"user registered successfully ")
   )

})
export {registeruser}

