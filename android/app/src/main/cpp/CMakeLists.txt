# JARVIS Phase 10 (stub) + Phase 13B (real llama.cpp backend) + Phase 13D-CMake (make activation
# of the real backend loud/deterministic instead of silently skippable) — CMake target for the JNI
# bridge.
#
# This file ALWAYS builds native_llama_bridge.cpp — the deterministic stub Phase 10 added, which
# Phase 13B's own Part D requires be retained as the explicit fallback/test backend forever, not
# removed. It additionally builds llama_cpp_backend.cpp and links the real llama.cpp/ggml static
# libraries ONLY when the submodule at `llama.cpp/` (relative to this directory) is actually
# present — see LLAMA_CPP_SETUP.md (this directory) for the exact, reproducible steps to fetch and
# pin it. A checkout with no submodule builds the EXACT same stub-only target Phase 10 always has;
# nothing about Native Ink or any other Android target is affected either way.
#
# *** Phase 13D-CMake — IF YOU SEE THIS BUILD STILL NOT COMPILING llama_cpp_backend.cpp/llama ***
# *** EVEN THOUGH THE SUBMODULE IS PHYSICALLY PRESENT: delete `android/app/.cxx` (and, to be ***
# *** safe, `android/app/build`) BEFORE rebuilding, then rebuild. ***
# `./gradlew clean` does NOT reliably clear Android Gradle Plugin's own separate CMake build-cache
# directory (`.cxx/`, outside the normal `build/` tree in modern AGP) — a stale `CMakeCache.txt`/
# `build.ninja` generated BEFORE this submodule existed on disk can be silently reused by Ninja on
# a later build, producing EXACTLY the symptom this fix addresses: a native build log that shows
# only `native_llama_bridge.cpp` being compiled/linked, with no CMake configure-step output
# (no `message(STATUS ...)` lines at all) and no trace of `llama_cpp_backend.cpp`/the `llama`
# target — because Ninja never re-ran CMake's configure step in the first place, so none of this
# file's own logic (including the loud diagnostics added below) ever executed. Editing THIS file
# (as this fix does) makes AGP detect a change and re-trigger CMake's configure step on the very
# next build, which combined with the loud failure below should make any further misconfiguration
# immediately visible rather than silent.
#
# NOT BUILT/VERIFIED IN THIS SESSION — no Android NDK/SDK is available here (see
# native_llama_bridge.cpp's own header for the exact, reproduced reason, confirmed unchanged since
# Phase 10). What WAS verified in this session: both native_llama_bridge.cpp (stub-only AND with
# JARVIS_HAVE_LLAMA_CPP defined) and llama_cpp_backend.cpp compile cleanly under host g++
# (-Wall -Wextra -Werror -Wpedantic, zero warnings) against the REAL pinned llama.cpp tag's own
# public headers — see this phase's own final report for the exact commands. That proves every
# llama.cpp API call here is correctly spelled, typed, and used; it does NOT prove this links or
# runs on Android arm64, which requires the real NDK toolchain this sandbox does not have.
cmake_minimum_required(VERSION 3.22)
project(jarvis_llama_bridge)

set(JARVIS_LLAMA_CPP_DIR "${CMAKE_CURRENT_SOURCE_DIR}/llama.cpp")
set(JARVIS_SOURCES native_llama_bridge.cpp)

# Loud and unconditional (never only inside the if-branch below) — this line alone proves, from
# any future build log, whether CMake's configure step genuinely ran at all for this file. Its
# ABSENCE from a build log is the single clearest sign of the stale-`.cxx`-cache failure mode
# described above, as opposed to anything this file's own logic actually decided.
message(STATUS "jarvis_llama_bridge: configuring. JARVIS_LLAMA_CPP_DIR=${JARVIS_LLAMA_CPP_DIR}")

if(EXISTS "${JARVIS_LLAMA_CPP_DIR}/CMakeLists.txt")
    message(STATUS "jarvis_llama_bridge: llama.cpp submodule found at ${JARVIS_LLAMA_CPP_DIR} — building the real backend.")

    # Follow llama.cpp's own documented Android cross-compile requirements EXACTLY
    # (docs/android.md, "Cross-compile CLI using Android NDK", in the pinned submodule itself) —
    # see LLAMA_CPP_SETUP.md for why each of these is required, not merely a style preference.
    set(GGML_NATIVE OFF CACHE BOOL "" FORCE)      # host CPU != Android target CPU
    set(GGML_OPENMP OFF CACHE BOOL "" FORCE)      # NDK OpenMP is not reliably installable by CMake
    set(GGML_LLAMAFILE OFF CACHE BOOL "" FORCE)   # llamafile does not support Android
    set(LLAMA_OPENSSL OFF CACHE BOOL "" FORCE)    # OpenSSL is not part of the Android NDK stable API

    # This app only ever needs the library, never llama.cpp's own CLI tools/examples/server/tests —
    # building any of those would add unrelated attack surface and compile time for nothing this
    # app uses.
    set(LLAMA_BUILD_TOOLS OFF CACHE BOOL "" FORCE)
    set(LLAMA_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
    set(LLAMA_BUILD_SERVER OFF CACHE BOOL "" FORCE)
    set(LLAMA_BUILD_APP OFF CACHE BOOL "" FORCE)
    set(LLAMA_BUILD_TESTS OFF CACHE BOOL "" FORCE)
    set(LLAMA_SUBPROCESS OFF CACHE BOOL "" FORCE)

    # Static linking keeps this app's own packaged .so list simple (one jarvis_llama_bridge.so,
    # matching this project's existing Capacitor/Gradle packaging — no second llama.so/ggml.so to
    # bundle, sign, or lose track of).
    set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)

    # Deliberately NOT set here: any host-specific architecture-baseline compiler flag of any
    # kind, matching llama.cpp's own docs ("Do not add a global [that flag] unless you
    # intentionally want to raise the baseline instruction set for every compiled source") — the
    # Android toolchain file + GGML_NATIVE=OFF above are the only inputs that should influence
    # target instruction selection.
    add_subdirectory(${JARVIS_LLAMA_CPP_DIR} llama_cpp_build)

    # Phase 13D-CMake — "prefer explicit deterministic configuration over fragile
    # runtime/source detection": once the submodule directory is confirmed PRESENT (we are
    # inside this if-branch) and add_subdirectory() has run, the `llama` target either exists
    # now or this configuration is broken in a way worth stopping the build for — silently
    # falling through to the stub in that case would be exactly the "stub becomes the normal
    # Android path without anyone noticing" failure mode this fix exists to prevent. A target
    # genuinely missing here (not merely "submodule absent", which is handled entirely by the
    # outer if(EXISTS...) and never reaches this line) means llama.cpp's own CMakeLists.txt
    # did not define it as expected — most likely because this build reused a STALE CMake/Ninja
    # cache from before the submodule existed (see this file's own header for exactly how to fix
    # that) rather than anything wrong with the logic below.
    if(NOT TARGET llama)
        message(FATAL_ERROR
            "jarvis_llama_bridge: the llama.cpp submodule is present at ${JARVIS_LLAMA_CPP_DIR} "
            "and add_subdirectory() ran, but no 'llama' target exists afterward. This build will "
            "NOT silently fall back to the stub. The most common cause is a STALE Android Gradle "
            "Plugin CMake build cache from before the submodule existed: delete the "
            "'android/app/.cxx' directory (and, to be safe, 'android/app/build') and rebuild. If "
            "that does not resolve it, re-check that the submodule checkout matches the pinned "
            "commit and that its own CMakeLists.txt still defines a target literally named 'llama'.")
    endif()

    list(APPEND JARVIS_SOURCES llama_cpp_backend.cpp)
else()
    message(STATUS "jarvis_llama_bridge: no llama.cpp submodule found at ${JARVIS_LLAMA_CPP_DIR} — building the stub-only target (this is the normal, supported configuration for a checkout with no submodule).")
endif()

add_library(jarvis_llama_bridge SHARED ${JARVIS_SOURCES})

find_library(log-lib log)
target_link_libraries(jarvis_llama_bridge ${log-lib})

if(TARGET llama)
    target_compile_definitions(jarvis_llama_bridge PRIVATE JARVIS_HAVE_LLAMA_CPP)
    target_include_directories(jarvis_llama_bridge PRIVATE
        "${JARVIS_LLAMA_CPP_DIR}/include"
        "${JARVIS_LLAMA_CPP_DIR}/ggml/include"
    )
    target_link_libraries(jarvis_llama_bridge llama)
    message(STATUS "jarvis_llama_bridge: REAL llama.cpp backend ACTIVE — JARVIS_HAVE_LLAMA_CPP is defined, linking against the 'llama' target.")
else()
    message(STATUS "jarvis_llama_bridge: stub-only build — JARVIS_HAVE_LLAMA_CPP is NOT defined.")
endif()

set_target_properties(jarvis_llama_bridge PROPERTIES
    CXX_STANDARD 17
    CXX_STANDARD_REQUIRED ON
)
