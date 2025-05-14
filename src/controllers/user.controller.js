import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken"

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
    if(!username && !email)
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
    const loggedInUser=await User.findById(user._id).select("-password -refreshToken")

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

const refreshAccessToken=asyncHandler(async(req,res)=>{
   const incomingRefreshToken=req.cookies.refreshToken || req.body.refreshToken
   if(!incomingRefreshToken)
   {
      throw new ApiError(401,"Unauthorized Request")
   }
   try {
      const decodedToken=jwt.verify(
         incomingRefreshToken,
         process.env.REFRESH_TOKEN_SECRET
      )
   
      const user=User.findById(decodedToken?._id)
      if(!user)
      {
         throw new ApiError(401,"Invalid Refresh Token")
      }
   
       if(incomingRefreshToken!==user?.refreshToken)
      {
         throw new ApiError(401,"Refresh Token is expired or used")
      }
      const options={
         httpOnly:true,
         secure:true
      }
      const {accesToken,newRefreshToken}=await generateAccessAndRefreshToken(user._id)
   
      return res.status(200)
      .cookie("accessToken",accesToken,options)
      .cookie("refreshToken",newRefreshToken,options)
      .json(
         new ApiResponse(
            200,
            {
               accesToken,refreshToken:newRefreshToken
            },"Access Token Refreshed"
         )
      )
   } catch (error) {
      throw new ApiError(401,error?.message || "Invalid Refresh token")
      
   }
})

const changeCurrentPassword=asyncHandler(async(req,res)=>{
   const {oldPassword,newPassword}=req.body

   const user=await User.findById(req.user._id)
   const ispasswordCorrect= await user.ispasswordCorrect(oldPassword)
   if(!ispasswordCorrect)
   {
      throw new ApiError(400,"Invalid Password")
   }
   user.password=new password
   await user.save({validateBeforeSave:false})

   return res.status(200)
   .json(new ApiResponse(200,{},"Password changed successfully"))
})

const getCurrentUser=asyncHandler(async(req,res)=>{
   return res.status(200)
   .json(200,req.user,"current user fetched successfully")
})

const updateAccountDetails=asyncHandler(async(req,res)=>{
   const {fullName,email}=req.body

   if(!fullName && !email)
   {
      throw new ApiError(400,"All fields are required")
   }
   const user=await User.findByIdAndUpdate(
      req.user?._id,
      {
         $set:{
            fullName,
            email
         }
      },
      {new :true}).select("-password")

      return res.status(200)
      .json(new ApiResponse(200,user,"Account details updated successfully"))
})

const updateUserAvatar=asyncHandler(async(req,res)=>{
   const avatarLocalPath=req.file?.path
   if(!avatarLocalPath)
   {
      throw new ApiError(400,"Avatar file is missing")
   }
   const avatar=await uploadOnCloudinary(avatarLocalPath)
   if(!avatar.url)
   {
      throw new ApiError(400,"error while uploading on avatar")
   }
   const user=await User.findByIdAndUpdate(
      req.user?._id,
      {
         $set:{
            avatar:avatar.url
         }
      },
      {new :true}).select("-password")

      return res.status(200)
      .json(new ApiResponse(200,user,"Avatar updated successfully"))
})

const updateUserCoverImageAvatar=asyncHandler(async(req,res)=>{
   const coverImageLocalPath=req.file?.path
   if(!coverImageLocalPath)
   {
      throw new ApiError(400,"CoverImage file is missing")
   }
   const coverImage=await uploadOnCloudinary(coverImageLocalPath)
   if(!coverImage.url)
   {
      throw new ApiError(400,"error while uploading on CoverImage")
   }
   const user=await User.findByIdAndUpdate(
      req.user?._id,
      {
         $set:{
            coverImage:coverImage.url
         }
      },
      {new :true}).select("-password")
      return res.status(200)
      .json(new ApiResponse(200,user,"Cover Image updated successfully"))
})

export {registeruser,loginUser,logoutUser,refreshAccessToken,changeCurrentPassword,
   getCurrentUser,updateUserAvatar,updateAccountDetails,updateUserCoverImageAvatar}

