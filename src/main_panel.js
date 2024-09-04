import React, { useState, useEffect, useRef } from 'react';
import { Tooltip, Menu, MenuItem } from '@mui/material';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { DragControls } from 'three/examples/jsm/controls/DragControls';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer';
import * as TWEEN from '@tweenjs/tween.js';
import recompute_layout from './layout_engine';
import { draw_nn } from './draw_nn';
import * as utils from './utils'
import { scene, globals } from './utils';
import { CLICKABLE_LAYER } from './utils';
import pako from 'pako';
import Stats from 'three/addons/libs/stats.module.js';

// minimap window
const minimap_geometry = new THREE.PlaneGeometry(1, 1, 1, 1)
const minimap_material = new THREE.MeshBasicMaterial({
  color: new THREE.Color("grey"),
  transparent: true,
  opacity: 0.4
});
let minimap_window = new THREE.Mesh(minimap_geometry, minimap_material);
minimap_window.layers.set(utils.MINIMAP_OBJECTS_LAYER)
minimap_window.rotation.x = -Math.PI/2
let minimap_window_is_dragging = false


const MINIMAP_CAMERA_HEIGHT = 110
const MAIN_CAMERA_HEIGHT = 100
let minimap_camera, minimap_mount
let camera, mount
let INTERSECTED, controls, labelRenderer;

function update_main_camera_position(cx, cz) {
  camera.position.x = cx; controls.target.x = cx // need to update both otherwise camera rotates
  camera.position.z = cz; controls.target.z = cz
}

let drag_controls
let pointer = new THREE.Vector2();
let raycaster = new THREE.Raycaster(); 

const renderer = new THREE.WebGLRenderer({ antialias: true });
const minimap_renderer = new THREE.WebGLRenderer({ antialias: true });

//
let minimap_total_height = 120
let minimap_scrollbar_height = 6 // does not include outline

let camera_pos_x
let camera_pos_y
let camera_zoom

let orbit_controls_is_active = false
let currentMouseCoords = { x: 0, y: 0 };
let mouse_is_down = false
let rightClickStartTime = 0;
let rightClickMouseLocation = {x:0, y:0}

let hovered_op = null

const MainPanel = ({ filters, setDropdownValue, setDepthValues, setOverviewStats }) => {
  const mountRef = useRef(null);
  const statsRef = useRef(null);
  const minimapMountRef = useRef(null);
  const [hoveredObject, setHoveredObject] = useState(null);
  const [tooltipObject, setTooltipObject] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({ left: 0, top: 0 });
  const [contextMenu, setContextMenu] = useState(null);

  const [minimap_scrollbar_pos, setMinimapScrollbarPos] = useState({'left_perc':0, 'width_perc':0, 'display':'none', 'minimap_height':minimap_total_height});

  // remember this part of the code gets executed all the time. For one-time things on init, put in useEffect below

  ///////////////////////////////////////
  // Initialize scene once on page load
  ////////////////////////////////////

  useEffect(() => {

    // main mount
    globals.mount = mountRef.current;
    mount = globals.mount
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    globals.camera = new THREE.OrthographicCamera(
      mount.clientWidth / -2, mount.clientWidth / 2,
      mount.clientHeight / 2, mount.clientHeight / -2,
      0.1, 1000
    );
    camera = globals.camera
    
    // minimap mount
    minimap_mount = minimapMountRef.current
    minimap_renderer.setSize(minimap_mount.clientWidth, minimap_mount.clientHeight);
    minimap_mount.appendChild(minimap_renderer.domElement)

    minimap_camera = new THREE.OrthographicCamera( // same settings as above
      minimap_mount.clientWidth / -2, minimap_mount.clientWidth / 2,
      minimap_mount.clientHeight / 2, minimap_mount.clientHeight / -2,
      0.1, 1000
    );
    // Enable both default layer and clickable layer on the camera
    // minimap_camera.layers.enable(0); // Default layer
    minimap_camera.layers.enable(utils.MINIMAP_OBJECTS_LAYER);
    minimap_camera.layers.enable(utils.ACTVOL_OBJECTS_LAYER);
    minimap_camera.layers.enable(utils.OP_NODES_OBJECTS_LAYER);
    minimap_camera.layers.disable(0);
    minimap_camera.layers.disable(CLICKABLE_LAYER);


    minimap_camera.position.set(0, MINIMAP_CAMERA_HEIGHT, 0 );
    minimap_camera.zoom = 10 // for 2d
    minimap_camera.lookAt(0, 0, 0); // this is needed prob bc no orbitcontrols, so point camera at origin

    // Enable both default layer and clickable layer on the camera
    camera.layers.enable(0); // Default layer
    camera.layers.enable(CLICKABLE_LAYER);
    camera.layers.enable(utils.MINIMAP_OBJECTS_LAYER);
    camera.layers.enable(utils.ACTVOL_OBJECTS_LAYER);
    camera.layers.enable(utils.OP_NODES_OBJECTS_LAYER);
    camera.position.set(0, MAIN_CAMERA_HEIGHT, 0 );
    camera.zoom = 28 // for 2d

    // window.addEventListener( 'resize', onWindowResize );
    window.addEventListener( 'dblclick', onPointerDown );
    // window.addEventListener( 'click', singleClick );
    window.addEventListener('mousemove', onMouseMove, false);
    
    // Add an event listener for the 'keydown' event
    window.addEventListener('keydown', function(event) {
      // Check if the 'Ctrl' key is pressed and the 'D' key is pressed
      if (event.ctrlKey && event.key === 'd') {
          event.preventDefault(); // Optional: Prevent the default action (e.g., bookmark shortcut)
          console.log('Ctrl+D was pressed!');
          utils.update_labels()
      }
    });

    ////

    // Listener for mousedown, specifically for right-click (button === 2)
    window.addEventListener('mousedown', function (event) {
        if (event.button === 2) { // Right-click
            rightClickStartTime = Date.now(); // Record the time when mousedown occurs
            rightClickMouseLocation = {x:event.clientX, y:event.clientY}
        }
    });
    
    // Listener for mouseup, specifically for right-click (button === 2)
    window.addEventListener('mouseup', function (event) {
        if (event.button === 2) { // Right-click
            const rightClickEndTime = Date.now(); // Record the time when mouseup occurs
            const elapsedTime = rightClickEndTime - rightClickStartTime; // Calculate the elapsed time
            let elapsedDist = Math.sqrt((rightClickMouseLocation.x - event.clientX)**2 + (rightClickMouseLocation.y - event.clientY)**2)
            console.log("elapsedTime", elapsedTime, "elapsedDist", elapsedDist)
            if ((elapsedTime < 220) && (elapsedDist<10)) { // Check if the time elapsed is less than threshold
                console.log(hoveredObject)
                setContextMenu(
                  contextMenu === null ? { mouseX: event.clientX - 2, mouseY: event.clientY - 4, "current_op":hovered_op } : null
                )
            }
        }
    });
    


    // Label renderer
    labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize( mount.clientWidth, mount.clientHeight );
    labelRenderer.domElement.style.position = 'absolute';
    labelRenderer.domElement.style.top = '0px';
    mount.appendChild( labelRenderer.domElement );


    // controls
    controls = new OrbitControls( camera, labelRenderer.domElement );
    // note this is added to labelrenderer dom, otherwise can't use it. If no labelrendered, use renderer dom
    controls.enableRotate = false; // Disable rotation
    controls.screenSpacePanning = true; // Allow panning in screen space
    
    controls.addEventListener( 'start', function ( event ) {
      orbit_controls_is_active = true
    } );
    
    // update labels after controls moves
    controls.addEventListener( 'end', function ( event ) {
      orbit_controls_is_active = false

      utils.update_labels()
    } );

    // // middle btn pan, like blender and apparently adobe suite. Zoom still works as expected. I don't like this bc btn harder to press
    // right click is easier. Though maybe i'm just used to it?
    // controls.mouseButtons = {
    //   LEFT: null,   // Rotate with left mouse button
    //   MIDDLE: THREE.MOUSE.PAN,    // Pan with middle mouse button (scroll wheel click)
    //   RIGHT: null                 // Disable right mouse button
    // };

    /////
    drag_controls = new DragControls( [ minimap_window ], minimap_camera, minimap_renderer.domElement );
    drag_controls.addEventListener( 'dragstart', function ( event ) {
      console.log("minimap window dragstart")
      minimap_window_is_dragging = true
    } );
    // drag_controls.addEventListener( 'drag', function ( event ) {
    //   console.log("minimap window dragging")
    //   // minimap_window_is_dragging = false
    //   utils.update_labels()
    // } ); 
    // this makes janky, but if don't have then on dragend labels don't update. same as issue where we have to update 
    // before tween as well as after TODO

    drag_controls.addEventListener( 'dragend', function ( event ) {
      console.log("minimap window dragend")
      minimap_window_is_dragging = false
      utils.update_labels()
    } );

    drag_controls.getRaycaster().layers.set(utils.MINIMAP_OBJECTS_LAYER)


    // Set up stats
    const stats = new Stats();
    stats.showPanel(0); // Show FPS panel
    statsRef.current.appendChild(stats.dom);

    console.log(controls)

    
    //////////////////////////////////////////////////
    // Minimap
    //////////////////////////////////////////////////


    function render_minimap() {
        let plane = globals.nn.expanded_plane_mesh
        const boundingBox = new THREE.Box3().setFromObject(plane);

        // padding in two places here, i don't understand why can't just have it in first place (here)
        // NOTE happens bc actvols extend out of root plane. Was especially egregious in autoencoderkl, values 
        // largely fit to that model
        // this whole padding logic prob redo, brain fuzzy right now
        let pad_x = 5 // in scene coords
        let pad_y = 2
        boundingBox.max.x += pad_x
        boundingBox.min.x -= pad_x
        // boundingBox.max.z += pad_y
        boundingBox.min.z -= pad_y

        let scene_h_width = (boundingBox.max.x - boundingBox.min.x) / 2 // for the entire scene, not the view windo
        let scene_h_height = (boundingBox.max.z - boundingBox.min.z) / 2

        // zoom
        let zx = minimap_camera.right / scene_h_width // zoom to make right and left line up
        let MIN_ZOOM = 4.0 // heuristic for now. can take into account screen size to get min dist for scene y units
        zx = Math.max(MIN_ZOOM, zx)
        let zz = minimap_camera.top / scene_h_height // zoom to make top and bottom line up
        let zoom = Math.min(zx, zz)
        minimap_camera.zoom = zoom

        // position
        let cx = boundingBox.min.x + scene_h_width
        let cz = boundingBox.min.z + scene_h_height

        const minimap_h_width = minimap_camera.right / zoom;
        let minimap_background_left = cx - minimap_h_width // in local coords, where does left of minimap background cut off, on initial load
        let minimap_background_right = cx + minimap_h_width // in local coords, where does left of minimap background cut off, on initial load

        // const minimap_h_height = minimap_camera.top / zoom;
        // let base_height_proportion = scene_h_height / minimap_h_height
        // console.log("base height proportion", base_height_proportion.toFixed(2))

        // shift minimap background. relevent for long models. should shift / scroll like vscode minimap
        let scene_max_x = boundingBox.max.x
        let shift_to_align_right = scene_max_x - minimap_background_right + pad_x // NOTE why do i need to put padding here too? why not just in bounding box?
        let shift_to_align_left = -minimap_background_left - pad_x

        let main_camera_x = camera.position.x // main camera
        let main_camera_h_width = camera.right / camera.zoom
        let b = main_camera_h_width * 1 //1.5 // scalar gives buffer, at 1.0 will align perfectly, but nicer to have buffer
        let minimap_background_shift = utils.interp(main_camera_x, [b, scene_max_x-b], 
                                                                      [shift_to_align_left, shift_to_align_right])
        
        if (minimap_background_left>0) { // if minimap fits entirely within width, no need to scroll widthwise
          cx = cx + minimap_background_shift

          let scrollbar_width_perc = ((minimap_h_width*2) / scene_max_x)*100
          // scrollbar_width_perc = parseInt(scrollbar_width_perc)
          let scrollbar_left = utils.interp((main_camera_x-main_camera_h_width), [0, scene_max_x-main_camera_h_width*2], [0, (100-scrollbar_width_perc)])
          // scrollbar_left = parseInt(scrollbar_left)

          setMinimapScrollbarPos({
            'left_perc':scrollbar_left,
            'width_perc':scrollbar_width_perc,
            'display':'block',
            'minimap_height':(minimap_total_height-minimap_scrollbar_height)
          })
        } else {
          setMinimapScrollbarPos({
            'left_perc':0,
            'width_perc':0,
            'display':'none',
            'minimap_height':minimap_total_height
          })
        }


        // set
        minimap_camera.position.set(cx, MINIMAP_CAMERA_HEIGHT, cz);
        minimap_camera.lookAt(cx, 0, cz); //

        minimap_camera.updateProjectionMatrix(); // otherwise zoom doesn't update, though position does

        minimap_renderer.render(scene, minimap_camera);
    }

    function update_minimap_window_from_main_window() {
      let [h_width, h_height, cx, cz] = utils.get_main_window_position()
      minimap_window.scale.x = h_width*2; minimap_window.scale.y = h_height*2; minimap_window.scale.z = 1
      minimap_window.position.x = cx; minimap_window.position.z = cz; 
      minimap_window.position.y = MAIN_CAMERA_HEIGHT + 1 // slightly higher than main camera. Can also just make not visible to main camera  
    }

    function update_main_window_from_minimap_window() {
      let cx = minimap_window.position.x 
      let cz = minimap_window.position.z
      update_main_camera_position(cx, cz)
    }


    
    ///////////////////////////
    // Start animation loop
    animate();
    function animate(time) {
        stats.begin();
        let camera = globals.camera

        let camera_moved_or_zoomed = (camera_pos_x != camera.position.x) || (camera_pos_y != camera.position.y) || (camera_zoom != camera.zoom)
        let camera_zoom_changed = (camera_zoom !== camera.zoom)

        // this slows us down substantially during dragging, which is when we most need perf
        // minimap
        if (globals.nn) {
          if (minimap_window_is_dragging) {
            update_main_window_from_minimap_window()
            render_minimap()
          } else {
            if (camera_moved_or_zoomed || globals.is_tweening) {
              update_minimap_window_from_main_window()
              render_minimap()
            }
          }
        }

        TWEEN.update(time);
        controls.update();
        renderer.render( scene, camera );

        // // performance killers. sd at full goes from 30fps to 4fps on big computer. Mostly the update_labels fn
        // now w label pool we're at slightly less than 20fps
        labelRenderer.render( scene, camera );

        //////

        // tracking if camera moved
        camera_pos_x = camera.position.x
        camera_pos_y = camera.position.y
        camera_zoom = camera.zoom
        
        stats.end()

            //
        // controls.target.x = 100

        requestAnimationFrame( animate );
    }

    // Clean up on unmount
    return () => {
        window.removeEventListener('mousemove', onMouseMove, false);
        // window.removeEventListener('resize', onWindowResize, false);
        while (mount.firstChild) {
          mount.removeChild(mount.firstChild);
        }
        while (minimap_mount.firstChild) {
          minimap_mount.removeChild(minimap_mount.firstChild);
        }
      };
  }, []);

  //////////////////////////////////////////////////
  // onHover, onClick
  //////////////////////////////////////////////////

  // Function to get screen coordinates of a 3D object. Chatgpt
  function getScreenCoordinates(object) {
      const worldPosition = new THREE.Vector3();
      object.getWorldPosition(worldPosition);
      const ndc = worldPosition.project(camera);
      const screenX = (ndc.x + 1) / 2 * mount.clientWidth;
      const screenY = (-ndc.y + 1) / 2 * mount.clientHeight;
      return { clientX: screenX, clientY: screenY };
  }

  function onMouseMove(event) {
    //

    currentMouseCoords.x = event.clientX
    currentMouseCoords.y = event.clientY

    //
    raycaster.layers.set(CLICKABLE_LAYER)
    const sidebarWidth = 0 //document.querySelector('.sidebar').offsetWidth;
    // Update the pointer position
    pointer.x = ((event.clientX - sidebarWidth) / (window.innerWidth - sidebarWidth)) * 2 - 1;
    pointer.y = - (event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera( pointer, camera );
    const intersects = raycaster.intersectObjects( scene.children, true);
    let is_shift = event.shiftKey

    if ( intersects.length > 0 ) {
        if ("smaller_sphere" in intersects[ 0 ].object) { // mouseover node
            if ( INTERSECTED != intersects[ 0 ].object.smaller_sphere ) {

                clear_highlight_on_prev_intersected()


                if (intersects[ 0 ].object.actual_node.node_type=="module") {
                  INTERSECTED = intersects[ 0 ].object.outline_sphere;

                  INTERSECTED.prev_color = utils.node_color_outline //INTERSECTED.material.color // was sometimes getting stuck on highlight color?

                  INTERSECTED.material.color = utils.node_highlight_color 

                  setHoveredObject(INTERSECTED.actual_node); // dumb, using both. this one i don't understand how it works. bottom one is normal.
                  // so react is using this confusing one and i'm tracking hovered op myself. This is for context menu, only get it when module
                  hovered_op = INTERSECTED.actual_node
                } else { //
                  INTERSECTED = intersects[ 0 ].object.smaller_sphere;

                  INTERSECTED.prev_color = INTERSECTED.material.color 

                  setHoveredObject(null);
                  hovered_op = null
                }
                

                // let bigger = {x:INTERSECTED.scale.x+sphere_extra_on_hover, y:INTERSECTED.scale.y+sphere_extra_on_hover, z:INTERSECTED.scale.z}
                // new TWEEN.Tween(INTERSECTED.scale)
                //     .to(bigger, 100)
                //     .easing(utils.TWEEN_EASE)
                //     .start()
                INTERSECTED.scale.x += sphere_extra_on_hover
                INTERSECTED.scale.y += sphere_extra_on_hover
                console.log("mouseover node", INTERSECTED.actual_node)

                let screen_coords = getScreenCoordinates(INTERSECTED)

                setTooltipObject(INTERSECTED.actual_node);
                setTooltipPosition({ left: screen_coords.clientX, top: screen_coords.clientY });

                console.log("hoveredObject", hoveredObject, tooltipObject)
            }
        } else if ("expanded_op" in intersects[ 0 ].object) { // mouseover plane
            setTooltipObject(null);

            if ( INTERSECTED != intersects[ 0 ].object ) {

                clear_highlight_on_prev_intersected()

                INTERSECTED = intersects[ 0 ].object;
                let background_plane = INTERSECTED.expanded_op.expanded_plane_background_mesh
                
                let c = background_plane.material.color
                background_plane.prev_color = c
                background_plane.material.color = utils.plane_highlight_color
                
                // let bigger = {x:background_plane.scale.x+plane_outline_extra_on_hover, 
                //               y:background_plane.scale.y+plane_outline_extra_on_hover, 
                //               z:background_plane.scale.z}
                // new TWEEN.Tween(background_plane.scale)
                //     .to(bigger, 100)
                //     .easing(utils.TWEEN_EASE)
                //     .start()
                    
                background_plane.scale.x += plane_outline_extra_on_hover
                background_plane.scale.y += plane_outline_extra_on_hover

                setHoveredObject(intersects[ 0 ].object.expanded_op);
                hovered_op = intersects[ 0 ].object.expanded_op

                if (is_shift) console.log("mouseover plane", intersects[ 0 ].object.expanded_op)

            }
        } else {
            console.log("mouseover unknown something", intersects[0])
        }
    } else { // no selected at all
        clear_highlight_on_prev_intersected()
        INTERSECTED = null;
        setTooltipObject(null);
        setHoveredObject(null)
        hovered_op = null
    }
  }
  let plane_outline_extra_on_hover = .14 // TODO should be responsive to current zoom, more constant in screen space
  let sphere_extra_on_hover = .06
  function clear_highlight_on_prev_intersected() {
      if ( INTERSECTED ) { // going from one selected to another
          if ("expanded_op" in INTERSECTED) { // plane
              let background_plane = INTERSECTED.expanded_op.expanded_plane_background_mesh
              if (background_plane){
                background_plane.material.color = background_plane.prev_color
                background_plane.scale.x -= plane_outline_extra_on_hover
                background_plane.scale.y -= plane_outline_extra_on_hover
              }
          } else { // node
              INTERSECTED.material.color = INTERSECTED.prev_color
              INTERSECTED.scale.x -= sphere_extra_on_hover
              INTERSECTED.scale.y -= sphere_extra_on_hover
          }
      }
  }

  function onPointerDown( event ) {
    console.log("Doubleclick")
    raycaster.layers.set(CLICKABLE_LAYER)

    // Update the pointer position
    pointer.x = ((event.clientX) / (window.innerWidth)) * 2 - 1;
    pointer.y = - (event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera( pointer, camera );
    const intersects = raycaster.intersectObjects( scene.children, true);

    let is_shift = event.shiftKey
    if (is_shift) console.log("shift is down")

    if ( intersects.length > 0 ) {
        if ("smaller_sphere" in intersects[ 0 ].object) { // expanding an op
            let n = intersects[ 0 ].object.smaller_sphere.actual_node

            if (n.node_type=="module") {
                console.log("clicked ", n)
                expand_op(n)
            }

        } else if ("expanded_op" in intersects[0].object) { // collapsing an op
            let intersect = intersects[0].object
            console.log("attempting to collapse plane for ", intersect.expanded_op.name, intersect.expanded_op)
            if (is_shift) {
              collapse_all_of_mod_class(intersect.expanded_op.name)
            } else {
              collapse_op(intersect.expanded_op)
            }

        }
    } else { // background, other
    }

    renderer.render(scene, camera); // necessary?
  }
  function expand_op(op){
    op.collapsed = false
    utils.mark_attr(op, "originating_position", {x:op.x, y:0, z:op.y})
    recompute_layout()
    draw_nn()
    utils.mark_attr(op, "originating_position", undefined)
  }

  function expand_all_mods_of_class(mod_class) {
    let to_expand_container = [] // will be populated w ops to collapse
    utils.mark_all_mods_of_family_as_expanded(globals.nn, mod_class, to_expand_container)
    to_expand_container.forEach(o => utils.mark_attr(o, "originating_position", {x:o.x, y:0, z:o.y}))

    recompute_layout() // recompute datastructure
    draw_nn()

    to_expand_container.forEach(o => utils.mark_attr(o, "originating_position", undefined))
  }

  // collapse single expanded plane into node
  function collapse_op(op) {
      op.collapsed = true
      recompute_layout() // recompute datastructure

      // 'terminating_position' is the location of the plane after it has collapsed
      // for a single plane, this won't change before or after compute_layout
      utils.mark_attr(op, "terminating_position", {x:op.x, y:0, z:op.y}) // they will collapse to the top left corner, which is the expanded plane coords

      op.is_in_process_of_collapsing = true // use to tween in the new node

      utils.remove_all_meshes(op, {x:op.x, y:0, z:op.y}) // remove the physical meshes
      draw_nn()
      utils.mark_attr(op, "terminating_position", undefined)
      delete op.is_in_process_of_collapsing
  }

  // collapse all planes of class into nodes
  function collapse_all_of_mod_class(mod_class) {
      let ops_to_collapse = [] // will be populated w ops to collapse
      utils.mark_all_mods_of_family_as_collapsed(globals.nn, mod_class, ops_to_collapse)
      ops_to_collapse.forEach(o => utils.mark_attr(o, "plane_was_at_this_position", {x:o.x, y:0, z:o.y}))

      recompute_layout() // recompute datastructure

      ops_to_collapse.forEach(o => {
        utils.mark_attr(o, "terminating_position", {x:o.x, y:0, z:o.y}) // for multiple planes simultaneously, has to be done after recompute_layout
        o.is_in_process_of_collapsing = true
        utils.remove_all_meshes(o, {x:o.x, y:0, z:o.y}) // remove the physical meshes
      })
      draw_nn()

      // cleanup
      ops_to_collapse.forEach(o => {
        utils.mark_attr(o, "terminating_position", undefined)
        delete o.is_in_process_of_collapsing
      })
      ops_to_collapse.forEach(o => utils.mark_attr(o, "plane_was_at_this_position", undefined))
  }
 

  ////////////////////////////////////
  // On change settings, update appropriately
  ////////////////////////////////////

  useEffect(() => {
    if (filters.selectedModelPath) {
        // Load new nn
        console.log("loading nn", filters.selectedModelPath)
        utils.clear_scene()

        utils.globals.curves_lookup = {} // have to reset this so as to not track. All curves have already been removed from scene above

        utils.populate_labels_pool()

    
        fetch(filters.selectedModelPath)
            .then(response => response.arrayBuffer())
            .then(arrayBuffer => {
                // decompress gzip
                const uint8Array = new Uint8Array(arrayBuffer);
                const decompressed = pako.ungzip(uint8Array, { to: 'string' });
                const _nn = JSON.parse(decompressed);

                globals.nn = _nn

                //////////////////////////
                // Nn is loaded. initial processing
                // much of this could be done beforehand in python
                // set global nn data
                console.log("loaded nn", globals.nn)
                let nn = globals.nn

                function copy_dims(op) {
                    op.x_relative_original = op.x_relative
                    op.y_relative_original = op.y_relative
                    op.children.forEach(c => copy_dims(c))
                }
                copy_dims(nn)

                // mark parentage, convenience
                function mark_parentage(op) {
                  op.children.forEach(c => {
                    c.parent_op = op
                    mark_parentage(c)
                  })
                }
                mark_parentage(nn)

                function add_to_nodes_lookup(op) { // modules and ops
                  globals.nodes_lookup[op["node_id"]] = op
                  op.children.forEach(c => add_to_nodes_lookup(c))
                }
                add_to_nodes_lookup(nn)

                // adding actual upstream nodes, for convenience. Not used currently.
                console.time("linking upstream nodes")
                function link_upstream_nodes(op){
                  op.upstream_nodes = op.uns.map(nid => globals.nodes_lookup[nid])
                  op.children.forEach(c => link_upstream_nodes(c))
                }
                link_upstream_nodes(nn)
                console.timeEnd("linking upstream nodes")
                //
                // set max depth, used for scales
                globals.max_depth = 0
                function set_max_depth(op) {
                  globals.max_depth = Math.max(globals.max_depth, (op.depth ? op.depth : 0))
                    if (!op.collapsed){
                        op.children.forEach(c => set_max_depth(c))
                    }
                }
                set_max_depth(nn)
                console.log("max depth ", globals.max_depth)

                // Get default depth
                console.time("calc default depth")
                let depth_counter = {}
                function count_n_nodes_at_depth_levels(op) {
                    if (!(op.depth in depth_counter)) {
                      depth_counter[op.depth] = 0
                    }
                    depth_counter[op.depth] += op.children.length
                    op.children.forEach(c => count_n_nodes_at_depth_levels(c))
                }
                count_n_nodes_at_depth_levels(nn)

                let default_depth = globals.max_depth
                let max_default_nodes = 1600
                let cumulative_nodes_shown = 0
                for (let depth=0; depth<=globals.max_depth; depth++){
                  let nodes_at_depth = depth_counter[depth]
                  cumulative_nodes_shown += nodes_at_depth
                  if (cumulative_nodes_shown>max_default_nodes) {
                    default_depth = depth-1 // prev 
                    break
                  }
                }
                default_depth = Math.max(default_depth, 2)
                console.log("default depth ", default_depth, "nodes at depths", depth_counter)
                // init at collapsed depth
                utils.mark_all_mods_past_depth_as_collapsed(default_depth) // returns, but don't need it now bc no transitions

                // init w reshape ops collapsed
                utils.mark_all_mods_of_family_as_collapsed(nn, "reshape*", []) // returns, but don't need it

                recompute_layout()
                draw_nn()

                setDropdownValue(default_depth)
                const depth_values = [];
                for (let i = 1; i <= globals.max_depth; i++) { depth_values.push(i) }
                setDepthValues(depth_values)
                console.timeEnd("calc default depth")

                /////

                // minimap window plane
                scene.add(minimap_window)

                // set camera to default
                update_main_camera_position(0, 0)
                let default_zoom = 20
                camera.zoom = default_zoom
                camera.updateProjectionMatrix()

                // draw labels
                utils.update_labels()

                //////////////////
                //
                let total_params = 0
                let total_latency = 0
                let max_memory_allocated = 0
                function accumulate_stats(op) {
                  if ('n_params' in op) {
                    total_params += op.n_params 
                  }
                  if ('latency' in op) {
                    if (op.node_type == "function")
                    total_latency += op.latency 
                  }
                  if ('max_memory_allocated' in op) {
                    if (op.node_type == "function")
                    max_memory_allocated = Math.max(max_memory_allocated, op.max_memory_allocated)
                  }
                  op.children.forEach(c => accumulate_stats(c))
                }
                accumulate_stats(nn)
                let overviewStats = {
                  'total_params':total_params,
                  'total_latency':total_latency,
                  'max_memory_allocated':max_memory_allocated
                }
                setOverviewStats(overviewStats)
                console.log(overviewStats)
            })
    // end load new nn
    } else if (filters.dropdownValue) { 
        // dropdown value changed in control panel
        collapse_to_depth(filters.dropdownValue)
    }

  }, [filters])

  ///////////////////////////////////////////
  // right click

  const handleClose = () => {
    setContextMenu(null);
  };
  const handleRightClick = (event) => {
    event.preventDefault(); // don't want the default context menu
    // Not actually using this anymore, doing our own manually w right click. Couldn't get timing down easily enough using this one
    // 

    // setTimeout(() => {
    //   if (!mouse_is_down) {
    //     setContextMenu(
    //       contextMenu === null ? { mouseX: event.clientX - 2, mouseY: event.clientY - 4, "current_op":hoveredObject } : null
    //     )
    //   }
    // },300)
  };
  const contextMenuExpandModule = () => {
    let op = contextMenu.current_op
    expand_op(op)
    handleClose()
  }
  const contextMenuExpandAllOfClass = () => {
    let op = contextMenu.current_op
    expand_all_mods_of_class(op.name)
    handleClose()
  }
  const contextMenuCollapseAllOfClass = () => {
    let op = contextMenu.current_op
    collapse_all_of_mod_class(op.name)
    handleClose()
  }
  const contextMenuCollapseModule = () => {
    let op = contextMenu.current_op
    collapse_op(op)
    handleClose()
  }
  //
  const contextMenuExpandAllReshapeModules = () => {
    expand_all_mods_of_class("reshape*")
    handleClose()
  }
  const contextMenuCollapseAllReshapeModules = () => {
    collapse_all_of_mod_class("reshape*")
    handleClose()
  }
  //
  const contextMenuDebugModeOn = () => {
    globals.DEBUG = true

    simple_remake_sequence()
    handleClose()
  }
  const contextMenuDebugModeOff = () => {
    globals.DEBUG = false

    simple_remake_sequence()
    handleClose()
  }
  const contextMenuShowActivationVolumesOn = () => {
    globals.SHOW_ACTIVATION_VOLUMES = true

    simple_remake_sequence()
    handleClose()
  }
  const contextMenuShowActivationVolumesOff = () => {
    globals.SHOW_ACTIVATION_VOLUMES = false

    simple_remake_sequence()
    handleClose()
  }
  function simple_remake_sequence(){
    // convenience, for when we don't need to do the separate parts individually
    recompute_layout()
    draw_nn()
    utils.update_labels()
  }

  let tooltip_attrs_list = ['node_id', "dist_from_end_originator_count", "dist_from_end_global", "respath_dist", 
        "dist_from_start_originator_count", "dist_from_start_global",
        "row_counter", "draw_order_row",
        "mod_outputs", "input_group_ix", "input_group_sub_ix",
        'n_ops', 'depth', 'input_shapes', 'output_shapes', 'is_output_global', 
        "sparkflow", "params", "incremental_memory_usage", "max_memory_allocated", "latency", "n_params", "mod_inputs", "should_modularize"]

  const render_menu_items = () => {
    if (contextMenu === null) return [<MenuItem></MenuItem>]
    if (contextMenu.current_op) {
        let op = contextMenu.current_op
        if (op.collapsed) { // collapsed node
            return [
              <MenuItem onClick={contextMenuExpandModule}>Expand this module "{op.name}"</MenuItem>,
              <MenuItem onClick={contextMenuExpandAllOfClass}>
                Expand all modules of class "{op.name}"
              </MenuItem>,
          ]
        } else { // expanded plane
            return [
              <MenuItem onClick={contextMenuCollapseModule}>Collapse this module "{op.name}"</MenuItem>,
              <MenuItem onClick={contextMenuCollapseAllOfClass}>
                Collapse all modules of class "{op.name}"
              </MenuItem>,
          ]
        }

    } else { // no current op hovered over, root menu
      return [
        <MenuItem onClick={contextMenuDebugModeOn}>Turn on debug mode</MenuItem>,
        <MenuItem onClick={contextMenuDebugModeOff}>Turn off debug mode</MenuItem>,
        <MenuItem onClick={contextMenuShowActivationVolumesOn}>Show activation volumes</MenuItem>,
        <MenuItem onClick={contextMenuShowActivationVolumesOff}>Hide activation volumes</MenuItem>,
        <MenuItem onClick={contextMenuExpandAllReshapeModules}>Expand all reshape ops</MenuItem>,
        <MenuItem onClick={contextMenuCollapseAllReshapeModules}>Collapse all reshape ops</MenuItem>,
    ]
    }

  }


        

  return <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }} onContextMenu={handleRightClick}>

            <div style={{ zIndex: 2, width: '100%', height: `${minimap_total_height}px`, backgroundColor:'grey', 
                    position: 'absolute', top:'0px', left:'0px'
                    }}>
              <div style={{ backgroundColor:'white', width: '100%', height: `${minimap_scrollbar_height}px`, 
                            position:'relative', 
                            display: `${minimap_scrollbar_pos.display}`,
                            }}>
                  <div style={{ backgroundColor:'lightgrey', width: `${minimap_scrollbar_pos.width_perc}%`, height:'100%', position:'absolute', 
                                left: `${minimap_scrollbar_pos.left_perc}%`,
                                }}></div>
              </div>
              <div ref={minimapMountRef} style={{ backgroundColor:'lightgrey', width: '100%', height:`${minimap_scrollbar_pos.minimap_height}px`, position:'relative'}}></div>

            </div>


            <div ref={mountRef} style={{ zIndex: 1, width: '100%', flex: 1 }}/>

            <div ref={statsRef} style={{ zIndex: 2}} />


            {tooltipObject && (
              <Tooltip
                open={Boolean(tooltipObject)}
                title={
                  <div style={{ lineHeight: '1.5', userSelect: 'none' }}>
                    <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{tooltipObject.name }</div>
                    {
                      tooltip_attrs_list.map((p,i) => {
                        return <div key={i}>{p}: {String(tooltipObject[p])}</div>
                    })
                    }
                  </div>
                }
                placement="top"
                arrow
                style={{
                  position: 'absolute',
                  left: tooltipPosition.left,
                  top: tooltipPosition.top,
                  pointerEvents: 'none',
                }}
              >
                <div />
              </Tooltip>
            )}
              <Menu
                keepMounted
                open={contextMenu !== null}
                onClose={handleClose}
                anchorReference="anchorPosition"
                anchorPosition={
                  contextMenu !== null
                    ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
                    : undefined
                }
              >
                {render_menu_items()}
              </Menu>



          </div>;
};



export default MainPanel;


function collapse_to_depth(level) {

  let [ops_to_collapse, ops_to_expand] = utils.mark_all_mods_past_depth_as_collapsed(level)

  ops_to_expand.forEach(o => utils.mark_attr(o, "originating_position", {x:o.x, y:0, z:o.y}))
  ops_to_collapse.forEach(o => utils.mark_attr(o, "plane_was_at_this_position", {x:o.x, y:0, z:o.y}))

  recompute_layout() // recompute datastructure

  ops_to_collapse.forEach(o => {
    utils.mark_attr(o, "terminating_position", {x:o.x, y:0, z:o.y}) // for multiple planes simultaneously, has to be done after recompute_layout
    o.is_in_process_of_collapsing = true
    utils.remove_all_meshes(o, {x:o.x, y:0, z:o.y}) // remove the physical meshes
  })
  draw_nn()
  utils.update_labels()

  // cleanup
  ops_to_collapse.forEach(o => {
    utils.mark_attr(o, "terminating_position", undefined)
    delete o.is_in_process_of_collapsing
  })
  ops_to_expand.forEach(o => utils.mark_attr(o, "originating_position", undefined))
  ops_to_collapse.forEach(o => utils.mark_attr(o, "plane_was_at_this_position", undefined))
}