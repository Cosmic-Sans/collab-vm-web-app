collab-vm-web-app
-----------------

Building
--------
Requirements:
 * CMake
 * Emscripten
 * npm

First, build the capnp tool as you normally would for your platform:
```
mkdir build/capnp_tool
cd build/capnp_tool
cmake -DCMAKE_INSTALL_PREFIX=install -DBUILD_TESTING=OFF submodules/collab-vm-common/submodules/capnproto/
cmake --build . --target install
```

Then, build the Emscripten part:
```
mkdir build/collab-vm-web-app
cd build/collab-vm-web-app
emcmake cmake -DCAPNP_ROOT="../capnp_tool/install" ../..
cmake --build .
```
