# PostgreSQL to Contentful.com importer utility

## Dependencies
- nodejs https://nodejs.org/en/ (v4+)
- postgres https://www.postgresql.org/ (v9.5)
- Contentful account https://www.contentful.com


## Configuration
Edit configuration in `config.js` or set env variables.


## Database setup
- create a database
- run the `sql/create_table.sql` to create table
- run the `sql/insert_data.sql` to insert data
- update the database connection URL in `DATABASE_URL` config parameter


## Contentful setup
- login to https://www.contentful.com, create a space if no one, the space id should be set to `CONTENTFUL_SPACE_ID` config parameter
- create a content type, the name should be set to `CONTENTFUL_CONTENT_TYPE` config parameter
- for the created content type, create fields, the mapping.json contentfulFields array shows the needed fields,
  the following image also shows the needed fields in Contentful: [fields.png](https://postimg.org/image/pxoth6ffr/)


## Contentful API access token
The page (https://www.contentful.com/developers/docs/references/authentication/#the-management-api) show details
to generate access token for contentful API. Basically, the following is needed:

- create an OAuth app in https://app.contentful.com/account/profile/developers/applications/new, give full privileges to the app,
  including READ and MANAGE; the redirect URI may be like `https://localhost:3000/oauth`, but you don't need to setup a server
  to handle this callback endpoint; when creating app, a Uid is generated for the app, copy it and it will be used below
- use a browser to access `https://be.contentful.com/oauth/authorize?response_type=token&client_id=$YOUR_APPS_CLIENT_ID&redirect_uri=$YOUR_APPS_REDIRECT_URL&scope=content_management_manage
`, the $YOUR_APPS_CLIENT_ID is the above Uid of the app, the $YOUR_APPS_REDIRECT_URL is the above redirect URI of the app
- the Contentful asks your approval for the app to access your data, approve it
- then it will redirect you to the URL like `https://localhost:3000/oauth#access_token=0f1416ab142c11660981bd7c65a3847e47c5102b2a557dd73b031809455c5b1c&token_type=bearer`, because we don't setup to handle the redirect URL, so it will fail, but it doesn't matter, we can exract the access token from just this URL, copy it to the CONTENTFUL_ACCESS_TOKEN config parameter

#Locale Setup

Localisation requires three basic steps :

- Step 1 : Click Settings> Locales after logging into contentful dashboard. Now you need to activate the require locales by selecting them.
- Step 2 : Enable fields localisation thrugh settings of individual fields in your content model
- Step 3 : Enable locale for content as shown in images under images/setuplocales


## Local deployment
- install dependencies `npm install`
- run lint check `npm run lint`
- view help `node src/importer -h`
- generate mapping stub file `node src/importer map mapping.json config.js`
- modify the generated mapping stub file, edit mapping in the `mapping` child object
- then we may use insert,update,delete,publish,draft commands to manage data, see below section

## Verification

Insert data to contentful:
- node src/importer insert mapping.json config.js
  ( This will insert data into contentful with content with same id and of different locales together)

Insert data to contentful with where clause:
- node src/importer insert mapping.json config.js id='1'
	
Publish data in contentful:
- node src/importer publish mapping.json config.js

Draft data in contentful:
- node src/importer draft mapping.json config.js

Draft data in contentful with where clause:
- node src/importer draft mapping.json config.js id='1'

You may modify some data in database, including setting 'Published'/'Draft' status, then call below 'update' command,
the data will be updated to contentful, and they will be published/unpublished according to the statuses in database:
- node src/importer update mapping.json config.js

Delete ALL data in contentful:
- node src/importer delete mapping.json config.js

Delete data of particular id
- node src/importer delete mapping.json config.js id='1'

Delete content of particular id and particular language/locale
- node src/importer deletelocalebyid mapping.json config.js id='1' en-US

During the above operations, you may go the contentful, browse the created content type,
check the Content tab to see the contentful entries.
You may also go to the database to see content of the item_tab table.

