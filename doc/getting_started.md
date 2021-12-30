# Web Server
Step-by-step guides to setting up the necessary server implementation to use alongside code in the Web Server directory.

---
## Quick start guide
1. Typical startup:

   * Launch a new terminal and execute **``nvs use latest``** to use the latest installed version of Node.js.

   * Launch a new terminal and execute **``npm run start``** to launch the Web Server.
   
   * Connect to the newly launched Web Server by running **``http://localhost:8080``** or **``https://localhost:8081``** in the **address bar** of a modern web browser.

2. **[OPTION A]** For once-off building of the web app:

   * **_[DEV ONLY]_** Launch a new terminal and execute **``nvs use latest``** to use the latest installed version of Node.js.

   * **_[DEV ONLY]_** Execute **``npm run build:client``** for a full cross-compilation of code to a minimized output for production use.

2. **[OPTION B]** For continuous updates while developing:

   * **_[DEV ONLY]_** Launch a new terminal and execute **``nvs use latest``** to use the latest installed version of Node.js.

   * **_[DEV ONLY]_** Execute **``npm run watch:client-dev``** to allow for SCSS to CSS cross-compilation, followed by generalized CSS cross-compilation.

---
## Windows environment setup
> Note: All commands are executed through the Windows Command Line, preferably as an Admin user, unless stated otherwise (press_ **\<WIN-KEY\>+\<R\>**_, type in_ **``cmd``**_, then press_ **\<CTRL\>+\<SHIFT\>+\<ENTER\>**_).

---
### Set up the JavaScript runtime environment
1. Install the [Chocolatey package manager](https://chocolatey.org/):

   * Execute **``@"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -InputFormat None -ExecutionPolicy Bypass -Command " [System.Net.ServicePointManager]::SecurityProtocol = 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://chocolatey.org/install.ps1'))" && SET "PATH=%PATH%;%ALLUSERSPROFILE%\chocolatey\bin"``** to download and install the latest applicable version of Chocolatey (may need administrative rights on the local node).

   * Restart the terminal and execute **``choco -v``** to verify that the command allows interaction with Chocolatey, confirming installation.

2. Install [NVS (Node Version Switcher)](https://github.com/jasongin/nvs):

   * Execute **``choco install nvs``** to install the latest system relevant version of NVS.

   * Restart the terminal and execute **``nvs -v``** to verify that the command allows interaction with NVS, confirming installation.

3. Install [Node.js](https://nodejs.dev/):

   * Execute **``nvs add lts all``** to install the latest long term support version of Node.js.

   * Execute **``nvs -list``** to verify that a system applicable version of Node.js is listed, confirming installation.

4. Set the system to use this newly installed version of Node.js (and by extension effect the corresponding [Next Phase Montage (NPM)](https://www.npmjs.com/) _{previously Node Package Manager}_):

   * Execute **``nvs use lts``** to use the latest long term support installed version of Node.js.

   * Execute **``node -v``** to verify that the installed version of Node.js is effected.

   * Execute **``npm -v``** to verify that the NPM version associated with the implemented [Node.js version](https://nodejs.org/en/download/releases/) is effected.

5. Verify installation and setup:

   * Execute **``node .\<PATH>\test\nodejs-app.js``** to launch the Web Server.

   * Connect to the newly launched Web Server by running **``http://localhost:8080``** in the **address bar** of a modern web browser (e.g. [Chrome](https://www.google.com/chrome/), [Edge](https://www.microsoft.com/en-us/edge), [Firefox](https://www.mozilla.org/en-US/firefox/new/), [Opera](https://www.opera.com), etc.).

   * Setup can be considered successful if the browser displays _``"Web server successfully running on vanilla Node.js"``_.

---
### Set up the web server
Sets up all of the necessary modules, for a detailed breakdown of the individual module installation steps, see _[OPTION B] Detailed setup_.

> Note: This set up process assumes that the JavaScript runtime environment has been installed and implemented correctly.

> Note: command will only work if an applicable version of Node.js is defined to NVS - see step 4 in the JS Runtime Environment setup procedure.

1. Execute **``npm install``** to install all of the necessary modules from the associated _package.json_ file.

2. Execute **``npm run build:server``** to build and set up the server.

3. Execute **``npm run build:client``** to build and set up the client files.

4. Verify installation and setup:

   * Execute **``npm run start``** to launch the Web Server.

   * Connect to the newly launched Web Server with **``http://localhost:8080``** or **``https://localhost:8081``** in the **address bar** of a modern web browser.

   * Setup can be considered successful if the browser routes to _``"{URL}/index.html"``_ (will display a basic map of the World if the system has an active internet connection).
---
<!-- 
#### **[OPTIONAL]** Set up Leaflet
> Note: This set up process assumes that the web framework has been installed and implemented correctly.

1. Add the [leaflet module]():

   * Execute **``npm install leaflet``** to install the Leaflet modules which will be used to provide the base map and further functionality associated with modern web based map interaction.

   * Check the _``<PATH>\node_modules\``_ directory to verify the presence of the newly added **``leaflet``** module.

2. Verify installation and setup:

   * Execute **``node .\<PATH>\bin\app.js``** to launch the Web Server.

   * Connect to the newly launched Web Server by running **``localhost:8080``** in the **address bar** of a modern web browser.

   * Setup can be considered successful if the browser routes to _``"localhost:8080/index.html"``_ (will display a basic map of Cape Town if the system has an active internet connection). -->
   

---
# Directory layout
Basic directory structure containing the Web Server files. Broadly inspired by the default [Node.js]().

* ``LICENSE``\
    Specifies basic usage and distribution rights.

* ``package-lock.json``\
    Auto-generated description of project dependencies and the specific versions of composite modules, allowing for quick installation of project dependencies.

* ``package.json``\
    Configuration file allowing for certain configuration of the Node.js Web Server, along with specific metadata relating to the server.

* ``postcss.config.cjs``\
    Basic ES module exports and plugin definitions.

* ``README.md``\
    This file, containing a basic description of the Web Server and its component files/structures.

* ``webpack-client.config.cjs``\
    Webpack build script to cross-compile the source code files from the **/src** directory to distributable code in the **/dist** directory.

* ``webpack-client.dev.cjs``\
    Section of the webpack build script used alongside ``webpack-client.config.cjs``, specifically contains the production deployment configurations of the web app (focus is on faster build and more verbose reporting).

* ``webpack-client.prod.cjs``\
    Section of the webpack build script used alongside ``webpack-client.config.cjs``, specifically contains the production deployment configurations of the web app (focus is on more compact code).

* ``webpack-server.cjs``\
    Webpack build script to set up the necessary files for deployment to Azure.

### **/admin**
Admin/management scripts that are not directly associated with the normal running of the web app, e.g. generation of certificates.

### **/dist**
Provides the entry point and files that can be served directly to connecting client browsers. This is the destination to which cross-compilation takes place.

### **/doc**
Contains basic documentation and guides to set up and test the Web Server.
* ``getting_started.md``\
    Guide containing detailed steps on setting up the Web Server from scratch.

### **/node_modules**
Node.js specific modules that provide basic functionalities to the Web Server.
_Note: this directory will not be listed in the repository, as it is installed through a package manager as part of the setup described in ``/doc/getting_started.md``_.

### **/src**
Source files used to develop the web server.
* ``404.html``\
    Page served on accessing a view or resource that client browsers have not been provided access to, or that does not exist on the server.

* ``azure-server.js``\
    Server setup that provides the Node.js with express web framework functionality and the necessary routing to serve as a static file loader - specifically as required for deployment to the Azure app service.

* ``client.js``\
    Primary client business logic and wiring in of functionality to the ``index.html`` file, also handles routing of MQTT based websockets data to and from the web app.

* ``index.html``\
    [Legacy index file](https://web.archive.org/web/19970605110106/http://www.w3.org/pub/WWW/Daemon/Features.html) which serves as the default entry page, this file will automatically be loaded by client browsers as this is a standard configuration.

* ``manifest.webmanifest``\
    Web manifest declaring the necessary instruction for the web app to be used as a PWA.

* ``server.js``\
    Server setup that provides the Node.js with express web framework functionality and the necessary routing to serve as a static file loader.

* ``web.config``\
    Azure IIS configuration file to allow for a node.js based site for use on the Azure app service.

* #### /certs
    Private and public keys necessary for setting up secure connections.

* #### /fonts
    Specific font files used in the web-site.

* #### /images
    Image files (preferably in SVG format) used for graphics in the web-site.

* #### /scripts
    EcmaScript based business logic code to the web app.

* #### /styles
    SCSS scripts defining the general wep app themes and styles.

### **/test**
Test server setups and scripts to validate Web Server functionality.

* ``nodejs-app.js``\
    Test server setup to verify vanilla Node.js functionality.

---