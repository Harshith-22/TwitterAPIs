const express = require('express')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const bcrypt = require('bcrypt')
const path = require('path')
const jwt = require('jsonwebtoken')

const app = express()
app.use(express.json())

const databasePath = path.join(__dirname, 'twitterClone.db')
let database = null

const initializeDbAndServer = async () => {
  try {
    database = await open({filename: databasePath, driver: sqlite3.Database})
    app.listen(3000, () => {
      console.log(`Server running at http://localhost:3000/`)
    })
  } catch (error) {
    console.log(`DB Error: ${error.message}`)
    process.exit(1)
  }
}

initializeDbAndServer()

//API-1 = register
app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  // check if user already exists with the same username
  const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';
    `
  const dbUser = await database.get(selectUserQuery)
  if (dbUser) {
    response.status(400)
    response.send('User already exists')
  } else if (password.length < 6) {
    response.status(400)
    response.send('Password is too short')
  } else {
    // Create a new user
    const hashedPassword = await bcrypt.hash(password, 10)
    const addNewUserQuery = `
        INSERT INTO user (name, username, password, gender) 
        VALUES ('${name}', '${username}', '${hashedPassword}', '${gender}');
        `
    await database.run(addNewUserQuery)
    response.send('User created successfully')
  }
})

//API-2 = login
app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const loginUserQuery = `SELECT * FROM user WHERE username= '${username}' ;`
  const loginUser = await database.get(loginUserQuery)
  if (loginUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPswdMatched = await bcrypt.compare(password, loginUser.password)
    if (!isPswdMatched) {
      response.status(400)
      response.send('Invalid password')
    } else {
      const payload = {username}
      const jwtToken = jwt.sign(payload, 'harshith_key')
      response.send({jwtToken})
    }
  }
})

const authenticateUser = (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'harshith_key', async (error, payLoad) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.headers.username = payLoad.username
        next()
      }
    })
  }
}

//API-3
app.get('/user/tweets/feed/', authenticateUser, async (request, response) => {
  try {
    const {username} = request.headers
    const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';
    `
    const dbUser = await database.get(selectUserQuery)
    const followingUsersQuery = `
    SELECT following_user_id FROM follower 
    WHERE follower_user_id = ${dbUser.user_id};
  `
    const followingUsersObjectsList = await database.all(followingUsersQuery)
    const followingUsersList = followingUsersObjectsList.map(object => {
      return object['following_user_id']
    })
    const getTweetsQuery = `
  SELECT 
    user.username AS username, 
    tweet.tweet AS tweet, 
    tweet.date_time AS dateTime
  FROM 
    tweet 
    INNER JOIN user ON tweet.user_id = user.user_id 
  WHERE
    tweet.user_id IN (
        ${followingUsersList}
    )
  ORDER BY tweet.date_time DESC 
  LIMIT 4;
  `
    const tweets = await database.all(getTweetsQuery)
    response.send(tweets)
  } catch (e) {
    console.log(e.message)
  }
})

//API-4

app.get('/user/following/', authenticateUser, async (request, response) => {
  const {username} = request.headers
  const getUserIdQuery = `SELECT * FROM user WHERE username= '${username}';`
  const getUserId = await database.get(getUserIdQuery)
  const getFollowingListQuery = `SELECT * FROM follower WHERE follower_user_id= ${getUserId.user_id} ;`
  const followingObjectList = await database.all(getFollowingListQuery)
  const followingList = followingObjectList.map(object => {
    return object['following_user_id']
  })
  const getNamesQuery = `SELECT name FROM user WHERE user_id IN (${followingList}) ;`
  const getNamesList = await database.all(getNamesQuery)
  response.send(getNamesList)
})

//API-5

app.get('/user/followers/', authenticateUser, async (request, response) => {
  const {username} = request.headers
  const getUserIdQuery = `SELECT * FROM user WHERE username= '${username}';`
  const getUserId = await database.get(getUserIdQuery)
  const getFollowerListQuery = `SELECT * FROM follower WHERE following_user_id= ${getUserId.user_id} ;`
  const followerObjectList = await database.all(getFollowerListQuery)
  const followerList = followerObjectList.map(object => {
    return object['follower_user_id']
  })
  const getNamesQuery = `SELECT name FROM user WHERE user_id IN (${followerList}) ;`
  const getNamesList = await database.all(getNamesQuery)
  response.send(getNamesList)
})

//API-6
app.get('/tweets/:tweetId/', authenticateUser, async (request, response) => {
  const {username} = request.headers
  const {tweetId} = request.params
  //get tweet id from request parameters
  //tweet id should be of one of he following
  //username.userid==follow.follower-id && follow.following-id=tweet.user.id should be true
  const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';
    `
  const dbUser = await database.get(selectUserQuery)
  const getTweetQuery = `
  SELECT * FROM tweet WHERE tweet_id = ${tweetId};
  `
  const tweetInfo = await database.get(getTweetQuery)

  const followingUsersQuery = `
    SELECT following_user_id FROM follower 
    WHERE follower_user_id = ${dbUser.user_id};
  `
  const followingUsersObjectsList = await database.all(followingUsersQuery)
  const followingUsersList = followingUsersObjectsList.map(object => {
    return object['following_user_id']
  })
  if (!followingUsersList.includes(tweetInfo.user_id)) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    const {tweet_id, date_time, tweet} = tweetInfo
    const getLikesQuery = `
    SELECT COUNT(like_id) AS likes FROM like 
    WHERE tweet_id = ${tweet_id} GROUP BY tweet_id;
    `
    const likesObject = await database.get(getLikesQuery)
    const getRepliesQuery = `
    SELECT COUNT(reply_id) AS replies FROM reply 
    WHERE tweet_id = ${tweet_id} GROUP BY tweet_id;
    `
    const repliesObject = await database.get(getRepliesQuery)
    response.send({
      tweet,
      likes: likesObject.likes,
      replies: repliesObject.replies,
      dateTime: date_time,
    })
  }
})

//API-7
app.get(
  '/tweets/:tweetId/likes/',
  authenticateUser,
  async (request, response) => {
    const {username} = request.headers
    const {tweetId} = request.params
    const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';
    `
    const dbUser = await database.get(selectUserQuery)
    const getTweetQuery = `
  SELECT * FROM tweet WHERE tweet_id = ${tweetId};
  `
    const tweetInfo = await database.get(getTweetQuery)

    const followingUsersQuery = `
    SELECT following_user_id FROM follower 
    WHERE follower_user_id = ${dbUser.user_id};
  `
    const followingUsersObjectsList = await database.all(followingUsersQuery)
    const followingUsersList = followingUsersObjectsList.map(object => {
      return object['following_user_id']
    })
    if (!followingUsersList.includes(tweetInfo.user_id)) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      //for tweet id get userids
      const getUserIdsOfTweetIdQuery = `SELECT user_id FROM like WHERE tweet_id=${tweetId};`
      const getUserIdsOfTweetObjectList = await database.all(
        getUserIdsOfTweetIdQuery,
      )
      const getUserIdsOfTweetList = getUserIdsOfTweetObjectList.map(object => {
        return object.user_id
      })
      const getUserNamesQuery = `SELECT username FROM user WHERE user_id IN (${getUserIdsOfTweetList});`
      const getUserNamesObjectList = await database.all(getUserNamesQuery)
      const getUserNamesList = getUserNamesObjectList.map(object => {
        return object.username
      })
      response.send({likes: getUserNamesList})
      //with user ids get usernames
    }
  },
)

//API-8
app.get(
  '/tweets/:tweetId/replies/',
  authenticateUser,
  async (request, response) => {
    const {tweetId} = request.params
    const {username} = request.headers
    const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';
    `
    const dbUser = await database.get(selectUserQuery)
    const getTweetQuery = `
  SELECT * FROM tweet WHERE tweet_id = ${tweetId};
  `
    const tweetInfo = await database.get(getTweetQuery)

    const followingUsersQuery = `
    SELECT following_user_id FROM follower 
    WHERE follower_user_id = ${dbUser.user_id};
  `
    const followingUsersObjectsList = await database.all(followingUsersQuery)
    const followingUsersList = followingUsersObjectsList.map(object => {
      return object['following_user_id']
    })
    if (!followingUsersList.includes(tweetInfo.user_id)) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      const {tweet_id, date_time} = tweetInfo
      const getUserRepliesQuery = `
    SELECT user.name AS name, reply.reply AS reply
    FROM reply 
    INNER JOIN user ON reply.user_id = user.user_id 
    WHERE reply.tweet_id = ${tweet_id};
    `
      const userRepliesObject = await database.all(getUserRepliesQuery)
      response.send({
        replies: userRepliesObject,
      })
    }
  },
)
//API-9
app.get('/user/tweets/', authenticateUser, async (request, response) => {
  const {username} = request.headers
  //get tweet details of each tweet of user

  //get user_id from username
  const selectUserQuery = ` SELECT * FROM user WHERE username = '${username}'; `
  const dbUser = await database.get(selectUserQuery)
  const {user_id} = dbUser
  // get tweet_ids and tweets from user_id
  const getTweetsQuery = `SELECT * FROM tweet WHERE user_id = ${user_id} ORDER BY tweet_id;`
  const tweetObjectsList = await database.all(getTweetsQuery)
  const tweetIdsList = tweetObjectsList.map(object => {
    return object.tweet_id
  })
  //get likes
  const getLikesQuery = `
    SELECT COUNT(like_id) AS likes FROM like 
    WHERE tweet_id IN (${tweetIdsList}) GROUP BY tweet_id
    ORDER BY tweet_id;
    `
  const likesObjectsList = await database.all(getLikesQuery)
  //get replies
  const getRepliesQuery = `
    SELECT COUNT(reply_id) AS replies FROM reply 
    WHERE tweet_id IN (${tweetIdsList}) GROUP BY tweet_id
    ORDER BY tweet_id;
    `
  const repliesObjectsList = await database.all(getRepliesQuery)
  //send response
  response.send(
    tweetObjectsList.map((tweetObj, index) => {
      const likes = likesObjectsList[index] ? likesObjectsList[index].likes : 0
      const replies = repliesObjectsList[index]
        ? repliesObjectsList[index].replies
        : 0
      return {
        tweet: tweetObj.tweet,
        likes,
        replies,
        dateTime: tweetObj.date_time,
      }
    }),
  )
})

//API-10
app.post('/user/tweets/', authenticateUser, async (request, response) => {
  const {username} = request.headers
  const {tweet} = request.body

  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'; `
  const dbUser = await database.get(selectUserQuery)
  const dateObj = new Date()
  const dateString = dateObj.toISOString()
  const dateTime = dateString.slice(0, 10) + ' ' + dateString.slice(11, 19)
  const addTweetQuery = `INSERT INTO tweet (tweet,user_id,date_time) VALUES ('${tweet}','${dbUser.user_id}', '${dateTime}' );`
  await database.run(addTweetQuery)
  response.send('Created a Tweet')
})

//API-11

app.delete('/tweets/:tweetId/', authenticateUser, async (request, response) => {
  const {username} = request.headers
  const {tweetId} = request.params
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'; `
  const dbUser = await database.get(selectUserQuery)
  const getTweetQuery = `SELECT * FROM tweet WHERE tweet_id = ${tweetId};`
  const tweetInfo = await database.get(getTweetQuery)
  if (dbUser.user_id !== tweetInfo.user_id) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    const deleteTweetQuery = `DELETE FROM tweet WHERE tweet_id=${tweetId};`
    await database.run(deleteTweetQuery)
    response.send('Tweet Removed')
  }
})

module.exports = app
