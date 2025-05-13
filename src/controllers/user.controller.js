import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";

const generateAccessAndRefreshToken=async (userId)=>{
   try {
      const user=await User.findById(userId)
      const accesToken=user.generateAccessToken()
      const refreshToken=user.generateRefreshToken()

      user.refreshToken=refreshToken
      await user.save({ validateBeforeSave:false })
      return {accesToken,refreshToken}

   } catch (error) {
      throw new ApiError(500,"something went wrong while generating refresh and access token")
      
   }
}

const registeruser=asyncHandler(async(req,res)=>{
   //get user details from frontend

    const {username,fullName,email,password}=req.body
    //console.log("email :",email)

   //validation -not empty

   if (
    [fullName,username,email,password].some((field)=>field?.trim()==="")
   ) {
        throw new ApiError(400,"All fields are required")
   }

   //check user is already exits: email or username

   const existedUser=await User.findOne({
    $or: [{username},{email}]
   })
   if(existedUser)
   {
    throw new ApiError(409,"user with username or email already exists")
   }
   //console.log(req.files)

   //check for avatar,check for images

   const avatarLocalPath=req.files?.avatar[0]?.path;
   //const coverImageLocalPath=req.files?.coverImage[0]?.path;
   let coverImageLocalPath;
   if(req.files && Array.isArray(req.files.coverImage)&&req.files.coverImage.length>0)
   {
      coverImageLocalPath=req.files.coverImage[0].path
   }

   if(!avatarLocalPath)
   {
    throw new ApiError(400,"Avatar file is requied")
   }
   //upload them to cloudinary,avatar

   const avatar= await uploadOnCloudinary(avatarLocalPath)
   const coverImage= await uploadOnCloudinary(coverImageLocalPath)
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
const loginUser=asyncHandler(async(req,res)=>{
    //req.body->data
    const {username,email,password}=req.body
    
    //username or email
    if(!username || !email)
    {
      throw new ApiError(400,"username or password is required")
    }
    //find the user
    const user =await User.findOne({
      $or:[{username},{email}]
    })
    if(!user)
    {
      throw new ApiError(404,"user does not exits")
    }
    //password check
    const ispasswordvalid=await user.ispasswordCorrect(password)
    if(!ispasswordvalid)
    {
      throw new ApiError(401,"Invalid user credentials")
    }
    //access or refresh token

    const {accesToken,refreshToken}=await generateAccessAndRefreshToken(user._id)
    //send cookie
    const loggedInUser=await user.findById(user._id).select("-password -refreshToken")

    const options={
      httpOnly:true,
      secure:true
    }

    return res.status(200)
    .cookie("accessToken",accesToken,options)
    .cookie("refreshToken",refreshToken,options)
    .json(
      new ApiResponse(
         200,
         {
            user:loggedInUser,accesToken,refreshToken
         },"User Logged In SuccessFully"
      )
    )
})

const logoutUser=asyncHandler(async(req,res)=>
{
   await User.findByIdAndUpdate(
      req.user._id,
      {
         $set:{
            refreshToken:undefined
         }
      },
      {
         new:true
      }
   )
    const options={
      httpOnly:true,
      secure:true
    }
    return res.status(200)
    .clearCookie("accessToken",options)
    .clearCookie("refreshToken",options)
    .json(new ApiResponse(200,{},"user logout Successfull"))
})

export {registeruser,loginUser,logoutUser}

