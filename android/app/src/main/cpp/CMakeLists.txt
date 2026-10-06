# JARVIS Phase 10 — minimal CMake target for the JNI bridge-validation stub.
#
# This builds ONLY native_llama_bridge.cpp (the deterministic stub — see that file's own header).
# llama.cpp itself is NOT vendored, fetched, or linked here (this phase's own Step 6 explicitly
# permits stopping at a clean JNI/runtime skeleton rather than destabilising the Android build by
# adding a large third-party native dependency that could not be verified in this environment —
# see this phase's own final report).
#
# NOT BUILT/VERIFIED IN THIS SESSION — no Android NDK/SDK is available here (see
# native_llama_bridge.cpp's own header for the exact, reproduced reason).
cmake_minimum_required(VERSION 3.22)
project(jarvis_llama_bridge)

add_library(jarvis_llama_bridge SHARED native_llama_bridge.cpp)

find_library(log-lib log)

target_link_libraries(jarvis_llama_bridge ${log-lib})

set_target_properties(jarvis_llama_bridge PROPERTIES
    CXX_STANDARD 17
    CXX_STANDARD_REQUIRED ON
)
