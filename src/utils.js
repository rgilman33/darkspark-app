import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer';

import * as TWEEN from '@tweenjs/tween.js';

import { Line2 } from 'three/examples/jsm/lines/Line2';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry';

import pako from 'pako';

///////////////////////////////
// globals
///////////////////////////////

export let globals = {
    max_depth: undefined,
    max_depth_visible: undefined,
    max_n_params_visible:undefined,
    curves_lookup: {},
    nodes_lookup: {},

    ops_of_visible_nodes: [], // convenience, for drawing and updating labels
    ops_of_visible_planes: [],
    camera: undefined,
    nn: undefined,
    mount: undefined,
    DEBUG:false,
    SHOW_ACTIVATION_VOLUMES:true,
    is_tweening:false,
    COLLAPSE_ALL_RESHAPE_MODULES:true,
    scene_bb: {x_max:0, x_min:0, y_max:0, y_min:0}
}
export const MINIMAP_OBJECTS_LAYER = 3
export const ACTVOL_OBJECTS_LAYER = 4
export const OP_NODES_OBJECTS_LAYER = 5

export let scene = new THREE.Scene();
scene.background = new THREE.Color(...[248, 249, 250].map(d => d/255));
// // Add lighting
// const ambientLight = new THREE.AmbientLight(0x404040); // Soft white light
// scene.add(ambientLight);

// const directionalLight = new THREE.DirectionalLight(0xffffff, 1); // White light, full intensity
// directionalLight.position.set(50, 50, 50).normalize(); // Position the light
// scene.add(directionalLight);


///////////////////////////////
// constants
///////////////////////////////

export function get_edge_color(brightness_factor) {
    const edge_color = new THREE.Color(...[33*brightness_factor, 37*brightness_factor, 41*brightness_factor].map(d=>d/255))
    return edge_color
}

export const node_color = new THREE.Color(...[22, 66, 91].map(d=>d/255))
export const node_color_outline = new THREE.Color(...[7, 32, 30].map(d=>d/255))



let highlight_color = new THREE.Color(...[231, 111, 81].map(d => d/255));
export const node_highlight_color = highlight_color

// const scene_background_color = new THREE.Color(...[248, 249, 250].map(d => d/255));
export const plane_color = new THREE.Color(...[248, 249, 250].map(d => d/255));
export const white_color = new THREE.Color(1,1,1);
export const plane_color_darker = new THREE.Color(...[228, 229, 230].map(d => d/255));
export const plane_outline_color = new THREE.Color(...[58, 124, 165].map(d=>d/255))

// doesn't seem to be much perf effect here if any. not true. noticeable on laptop. Big diff noticed when use flat lines rather 
// than bezier
export const CURVE_N_PTS = 20 //50


export const MAX_SPHERE_SIZE = .32

export const low_priority_names = ["Sequential"] // will be removed first when label collisions happen

//
const sphere_geometry = new THREE.CircleGeometry(1, 12);
const square_geometry = new THREE.PlaneGeometry(1, 1);

export const CLICKABLE_LAYER = 1
export const TWEEN_MS = 800
export const TWEEN_EASE = TWEEN.Easing.Linear.None

export const plane_highlight_color = highlight_color

///////////////////////////////
// viz utils
///////////////////////////////

export function get_curve_pts(pt1, pt2, n_pts) {
	let x_diff = pt2.x - pt1.x
	let z_diff = pt2.z - pt1.z
	let zd = .02
	let xd = .05
	let pts = [
			new THREE.Vector3(pt1.x, pt1.y, pt1.z),
			new THREE.Vector3(pt1.x + x_diff*xd,  pt1.y, pt1.z + z_diff*zd),
			new THREE.Vector3(pt2.x - x_diff*xd, pt2.y, pt2.z - z_diff*zd),
			new THREE.Vector3(pt2.x, pt2.y, pt2.z),
		]
	const curve = new THREE.CatmullRomCurve3(pts);
	curve.curveType = 'chordal';
	const points = curve.getPoints(n_pts);
    return points
}
export function get_pts_for_flat_line(pt1, pt2) {
    let pts = [
        new THREE.Vector3(pt1.x, pt1.y, pt1.z),
        new THREE.Vector3(pt2.x, pt2.y, pt2.z),
    ]
    return pts
}
// // normal line is constant width in most browsers despite setting thickness
// export function get_line_from_pts(pts, linewidth, color) {
// 	const line_geometry = new THREE.BufferGeometry().setFromPoints(pts);
// 	const material = new THREE.LineBasicMaterial( { color: color, linewidth:linewidth } );
// 	const lineObject = new THREE.Line(line_geometry, material);
//     lineObject.layers.set(MINIMAP_OBJECTS_LAYER)

// 	return lineObject
// }

export function pts_to_positions(pts) {
    // line2 uses flattened array
    const positions = [];
    pts.forEach(pt => {
        positions.push(pt.x, pt.y, pt.z);
    });
    return positions
}

// Line2 supports line width, which we're finding to be very helpful for understanding
export function get_line_from_pts(pts, linewidth, color) {
    // Convert the points array into a flat array of coordinates
    let positions = pts_to_positions(pts)

    // Create the LineGeometry and set the positions
    const lineGeometry = new LineGeometry();
    lineGeometry.setPositions(positions);

    color = globals.DEBUG ? (new THREE.Color(pts.length===2 ? "red" : "blue")) : color

    // Create the LineMaterial with specified color and linewidth
    const material = new LineMaterial({
        color: color,
        linewidth: linewidth,  // Line width in world units
        dashed: false,         // Optional: set to true if you want a dashed line
    });

    // Ensure material is updated before rendering
    // material.resolution.set(window.innerWidth, window.innerHeight);

    // Create the Line2 object using the geometry and material
    const lineObject = new Line2(lineGeometry, material);

    lineObject.layers.set(MINIMAP_OBJECTS_LAYER)

    return lineObject;
}

// NOTE line2 doesn't flicker bc of frustum culling, but line does, only after tweening but not on initial create. 

/*
devlog aug 30. bugs in transitions w line2 after expansion / collapse. Everything worked w Line, but Line2 a bit buggy.
Changed to use same method of creating new line in place of old one rather than reuse line obj itself, this matches
what we're doing on expansion. Note the weird thing is we need to shift y by at least something for it to work! otherwise
get a bug sometimes where it's not visible! sd1.4, the block after the mid block, expand first resnet, then expand the mid block
and the line going into resnet disappears! Is the small y shift triggering something that's needed? some difference btwn old and new?
aye. Also note we're still confused about when lines are getting more nodes added to them? need to be more clear on this. My brain hurts,
am tired, and this is a complex part of the code. Want this to be cleaner. Need to have good perf, no more pts than needed (i think),
but also need simplicity and cleanliness in our code. It currently seems to work, but i don't like this confusion and complexity
*/

export function get_edge_pts(n0, n1) {
    // let same_y = globals.DEBUG ? n0.y_unshifted==n1.y_unshifted : n0.y==n1.y 
    let same_y = n0.y_unshifted===n1.y_unshifted
    let same_module = n0.parent_op === n1.parent_op
    let same_row = same_module && (n0.draw_order_row===n1.draw_order_row)
    let neither_is_module = n0.node_type!=="module" && n1.node_type!=="module" 
    // this will get turned into multipt curve on expansion or collapse

    // cam refactor around needing this. It's when edges going into collapse module, 
    // the one that connects at base level should have two pts but we automatically tell all to be curve
    // and yet we have issue where even when same row
    // eff. with this, we're doing way too many curved edges TODO need to get around this
    let x_dist = n1.x - n0.x
    let pt1 = {x:n0.x, y:0, z:n0.y} // n0
    let pt2 = {x:n1.x, y:0, z:n1.y} // n1
    let pts

    if (same_y) { // flat
        // lines should get the number of pts they'll ever need. If possibility of shifting to curved line, init now w enough pts.
        // if guaranteed to always be same y, can suffice w two pts. This is for perf, many of our lines will always be straight, and 
        // on laptop this makes difference. This saves complexity later bc don't have to update n_pts in the curve ever, which we were doing before
        // and works w Line but not easily w Line2, still not understood why, but this is conceptually fine, and simpler
        // if (same_row && neither_is_module) { // nodes in the same row should never be at different y position, regardless of any transition
        if (same_row) { // nodes in the same row should never be at different y position, regardless of any transition
            pts = get_pts_for_flat_line(pt1, pt2)
        } else { // this line is flat now but may change when layout changes. Init to have enough pts for transition wout having to update n_pts
            pts = get_curve_pts(pt1, pt2, CURVE_N_PTS)  
        }

    } else { // has vertical part
        // let min_x_dist = Math.round(Math.abs(n1.y_relative - n0.y_relative) / 2) // same as in layout_engine. should consolidate
        // let elbow_x_dist = Math.max(min_x_dist, 1)
        let elbow_x_dist = 2

        if (x_dist > 2) { // elbow. Compound curve
            // if ((n0.respath_dist == n1.respath_dist) || n0.is_last_in_line){ // normal elbow TODO this needs work. Mark it in layout_engine. 
                if ( n0.is_last_in_line){ // normal elbow 
                let elbow = {x:n1.x-elbow_x_dist, y:0, z:n0.y}
                let flat_pts = get_pts_for_flat_line(pt1, elbow)
                let curve_pts = get_curve_pts(elbow, pt2, CURVE_N_PTS-2)
                pts = flat_pts.concat(curve_pts)    
            } else { // pre elbow // TODO pre-elbow also needs to be added to occ blocking in layout engine
                let elbow = {x:n0.x+elbow_x_dist, y:0, z:n1.y}
                let curve_pts = get_curve_pts(pt1, elbow, CURVE_N_PTS-2)
                let flat_pts = get_pts_for_flat_line(elbow, pt2)
                pts = curve_pts.concat(flat_pts)
            }
        } else { // x dist is one, single vertical curve
            pts = get_curve_pts(pt1, pt2, CURVE_N_PTS)
        }
    }
    return pts
}

// /////////////////
// // ease the slope. In conjunction w layout engine
// let min_x_dist = (Math.abs(n0.y - n1.y) / 2)
// let x_threshold = n1.x - min_x_dist
// let elbow_x = Math.max(n0.x, x_threshold)
// let elbow = {x:elbow_x, y:0, z:n0.y}

export function get_node_color(n) {
    if (n.conditioning_entering_respath) {
        return new THREE.Color("green")
    } else if (n.remove_this_aux_output) {
        return new THREE.Color("orange")
    } else if (n.is_conditioning_upstream) {
        return new THREE.Color("aqua")
    } else if (n.is_conditioning) {
        return new THREE.Color("blue")
    } else if (n.is_global_input) {
        return new THREE.Color("orange")
    } else if (n.is_input && n.dns.length==0) {
        return new THREE.Color("black")
    } else if (n.is_output_global) {
        return new THREE.Color("purple")
    } else if (n.is_input) {
        return new THREE.Color("yellow")
    } else if (n.is_output) {
        return new THREE.Color("red")
    } else if (n.node_type=="mod_out") {
        return new THREE.Color("pink")
    } else if (n.node_type=="mod_in") {
        return new THREE.Color("gold")
    } else {
        return new THREE.Color("grey")
    }
}

export function _get_node_color_non_debug (n) {
    if (n.is_tensor_node) {
        return new THREE.Color(...[33, 37, 41].map(d=>d/255))
    } else {
        return node_color
    }
}

export function get_z_plane(op) {
	// return interp(op.n_ops, [2,20,800], [-.1, -.3, -.9]) // 3d
	return interp(op.depth, [0,100], [-10, -1])
}

export function get_color_from_depth(d) {
	let d_range = globals.max_depth_visible<=2 ? [0, globals.max_depth_visible] : [1, globals.max_depth_visible-1]
	let c1 = [173, 181, 189]
	let c2 = [248, 249, 250]

	c1 = c1.map(d => d/255)
	c2 = c2.map(d => d/255)
	let r = interp(d, d_range, [c1[0], c2[0]])
	let g = interp(d, d_range, [c1[1], c2[1]])
	let b = interp(d, d_range, [c1[2], c2[2]])
	const color = new THREE.Color(r, g, b)
	return color
}

export function get_plane_color(op) {
	let d = op.depth
    let color = get_color_from_depth(d)
	return color
}

let MIN_SPHERE_SIZE = .06

export function get_sphere_scale(op) {
    let v = ("n_params" in op) ? op.n_params : 0
    v += 1 // don't want sqrt of zero
	let scalar = interp(Math.sqrt(v), [0, Math.sqrt(globals.max_n_params_visible)], [MIN_SPHERE_SIZE, MAX_SPHERE_SIZE])
    return scalar
}

export function scale_sphere(sphere, op) {
    let scalar = get_sphere_scale(op)
	sphere.scale.x = scalar
	sphere.scale.y = scalar
	// sphere.scale.z = scalar
}

export function get_group_label(op) {
	const div = document.createElement( 'div' );
	div.className = 'group_label';
	let s = op.name.split("-")
	let text = s[0].toUpperCase() 
	if (s.length==2) text += "-" + s[1].slice(s[1].length-4, s[1].length) + "-" + op.row_counter // 
	div.innerHTML = text
	div.style.backgroundColor = 'transparent';

	const label = new CSS2DObject( div );
    label.element.style.display = 'none'

	return label
}

let act_vol_base_color = [115, 147, 179].map(d=>d/255) // blue-grey
const materials = [
    new THREE.MeshBasicMaterial({color: new THREE.Color(...act_vol_base_color.map(d=>d*.2))}), // Front
    new THREE.MeshBasicMaterial({ color: 0x00ff00 }), // Green
    new THREE.MeshBasicMaterial({color: new THREE.Color(...act_vol_base_color.map(d=>d*1.))}), // Top

    new THREE.MeshBasicMaterial({ color: 0xffff00 }), // Yellow
    new THREE.MeshBasicMaterial({color: new THREE.Color(...act_vol_base_color.map(d => d*.5))}), // Facing

    new THREE.MeshBasicMaterial({ color: 0x00ffff })  // Cyan
  ];
const overflow_materials = [ // quick hack so can see when we have overflow 
new THREE.MeshBasicMaterial({color: new THREE.Color('red')}), // Front
new THREE.MeshBasicMaterial({ color: 0x00ff00 }), // Green
new THREE.MeshBasicMaterial({color: new THREE.Color(...act_vol_base_color.map(d=>d*1.))}), // Top

new THREE.MeshBasicMaterial({ color: 0xffff00 }), // Yellow
new THREE.MeshBasicMaterial({color: new THREE.Color(...act_vol_base_color.map(d => d*.5))}), // Facing

new THREE.MeshBasicMaterial({ color: 0x00ffff })  // Cyan
];

  
export function get_activation_volume(n, specs){

    let color = get_node_color(n)
    let act_vol_materials = specs.depth_overflow > 0 ? overflow_materials : materials

    let shear_to_show_top = -0.6
    let shear_to_show_front = -0.6

    // // Calculate the scaling factor to adjust the width
    // const scalingFactor = Math.sqrt(1 + shear_to_show_front ** 2); // Hypotenuse of the shear angle
    // const adjustedWidth = specs.width / scalingFactor; // Adjust the width based on scaling
    // // Create the box geometry with adjusted width
    // const box_geometry = new THREE.BoxGeometry(specs.depth, specs.height, adjustedWidth);

    const box_geometry = new THREE.BoxGeometry(specs.depth, specs.height, specs.width*.5); // total hack estimated value for scalar

    const shearMatrix = new THREE.Matrix4().set(
        1, 0, shear_to_show_front, 0, // fake 'rotate' to show front
        0, 1, shear_to_show_top,   0, // fake 'rotate' to show top
        0, 0, 1,   0, // No shear on Z-axis
        0, 0, 0,   1  // No change in perspective
    );
    // Apply the shear transformation to the geometry
    box_geometry.applyMatrix4(shearMatrix);
    
    
    // box_geometry.translate(-.5, 0, 0) // origin on the right side so box ends where tensor nodes used to be
    box_geometry.translate(-specs.depth/2, 0, 0) // origin on the right side so box ends where tensor nodes used to be
    
    let sphere = new THREE.Mesh( box_geometry, act_vol_materials )
    





    sphere.layers.set(ACTVOL_OBJECTS_LAYER)

    sphere.rotation.x = -Math.PI / 2; // Rotate 90 degrees to make it face upward
    sphere.position.y += .1 // shift towards camera so doesn't overlap w edges

    // // bc orthographic
    // sphere.rotation.x += .3
    // sphere.rotateOnWorldAxis(new THREE.Vector3(0, 0, 1), 0.3);


    // sphere.scale.y = specs.height
    // sphere.scale.z = specs.width
    // sphere.scale.x = specs.depth

    let group = new THREE.Group();
    group.add(sphere)

    // Create a larger sphere for click events
    let largerSphere = new THREE.Mesh(sphere_geometry,
            new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0 })); // color doesn't matter
    largerSphere.rotation.x = -Math.PI / 2; // Rotate 90 degrees to make it face upward
    largerSphere.position.y += 0
    
    let s = 3
    let larger_sphere_scale = Math.min(sphere.scale.x*s, MAX_SPHERE_SIZE) // don't need our large spheres to have any extra for clicking
    largerSphere.scale.x = larger_sphere_scale
    largerSphere.scale.y = larger_sphere_scale
    largerSphere.scale.z = larger_sphere_scale
    largerSphere.layers.set(CLICKABLE_LAYER);
    largerSphere.smaller_sphere = sphere
    group.add(largerSphere);

    group.children.forEach(c => c.actual_node = n) // required for onHover, click events

    group.children.forEach(o => {
        o.visible = true
    })
    return group
}


export function get_sphere_group(n){
    
    let sphere
    let color = get_node_color(n)
    if (n.node_type=="function" || n.node_type=="module") {
        sphere = new THREE.Mesh( sphere_geometry, new THREE.MeshBasicMaterial( { color: color } ) )
        sphere.layers.set(OP_NODES_OBJECTS_LAYER)
    } else {
        sphere = new THREE.Mesh( square_geometry, new THREE.MeshBasicMaterial( { color: color } ) )
    }

    sphere.rotation.x = -Math.PI / 2; // Rotate 90 degrees to make it face upward
    sphere.position.y += .1 // shift towards camera so doesn't overlap w edges

    scale_sphere(sphere, n)

    let group = new THREE.Group();
    group.add(sphere)

    // Create a larger sphere for click events
    let largerSphere = new THREE.Mesh(sphere_geometry,
        new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0 })); // color doesn't matter
    largerSphere.rotation.x = -Math.PI / 2; // Rotate 90 degrees to make it face upward
    largerSphere.position.y += 0
    
    let s = 3
    let larger_sphere_scale = Math.min(sphere.scale.x*s, MAX_SPHERE_SIZE) // don't need our large spheres to have any extra for clicking
    largerSphere.scale.x = larger_sphere_scale
    largerSphere.scale.y = larger_sphere_scale
    largerSphere.scale.z = larger_sphere_scale
    largerSphere.layers.set(CLICKABLE_LAYER);
    largerSphere.smaller_sphere = sphere
    group.add(largerSphere);

    // add outline to modules
    if (n.node_type=="module") {
        let _sphere = new THREE.Mesh( sphere_geometry, new THREE.MeshBasicMaterial( { color: node_color_outline } ) )
        _sphere.rotation.x = -Math.PI / 2; // Rotate 90 degrees to make it face upward
        _sphere.position.y += .09
        let s = sphere.scale.x+.05 // slightly bigger than inner circle
        _sphere.scale.x = s
        _sphere.scale.y = s
        _sphere.scale.z = s
        group.add(_sphere)
        largerSphere.outline_sphere = _sphere
    }

    //
    group.children.forEach(c => c.actual_node = n) // required for onHover, click events

    group.children.forEach(o => {
        o.visible = true
    })
    return group
}

export function remove_dom_el_bv_class_name (class_name) { // chatgpt
    var elements = document.getElementsByClassName(class_name);
    // Use a while loop to remove elements because getElementsByClassName returns a live HTMLCollection
    while (elements.length > 0) {
        elements[0].parentNode.removeChild(elements[0]);
    }
}

export function clear_scene() {
    scene.traverse(function(object) { // chatgpt
        if (object.isMesh) {
            if (object.geometry) {
                object.geometry.dispose();
            }

            if (object.material) {
                if (object.material.isMaterial) {
                    cleanMaterial(object.material);
                } else {
                    // An array of materials
                    for (const material of object.material) cleanMaterial(material);
                }
            }
        }
    });

    function cleanMaterial(material) {
        material.dispose();

        // Dispose textures
        for (const key of Object.keys(material)) {
            const value = material[key];
            if (value && typeof value === 'object' && 'minFilter' in value) {
                value.dispose();
            }
        }
    }
    while(scene.children.length > 0){
        scene.remove(scene.children[0]);
    }

    scene.clear()
    let names = ["group_label", "label"]
    names.forEach(n => remove_dom_el_bv_class_name(n))
}

export function get_plane_specs(op){
    
    // let w = op.w
    let w = op.plane_info.max_x - op.plane_info.min_x
    let h = op.plane_info.max_y - op.plane_info.min_y
    let target_y = get_z_plane(op) // based on depth
    let target_x = op.plane_info.min_x + w/2
    let target_z = op.plane_info.min_y + h/2

    const target_pos = { x: target_x, y: target_y, z: target_z };

    return [h,w,target_pos]
}

export function remove_sphere(op) {
    if (op.mesh != undefined) {
        remove_label_from_op_and_return_to_pool(op)
    }
    scene.remove(op.mesh)
    op.mesh = undefined
}

export function scale_to_zero_and_shift_to_location_then_remove(op, target_position) {

    new TWEEN.Tween(op.mesh.scale)
        .to({x:0, y:0, z:0}, TWEEN_MS) 
        .easing(TWEEN_EASE)
        .start();
        
    new TWEEN.Tween(op.mesh.position)
            .to(target_position, TWEEN_MS) 
            .easing(TWEEN_EASE)
            .onComplete(() => {
                remove_sphere(op)
            })
            .start();
}

function deleteCSS2DLabel(label) { // chatgpt
    if (label && label.element && label.parent) {
        // Remove the label from the scene or its parent
        // label.parent.remove(label);
        scene.remove(label)

        // Dispose of the label's DOM element
        if (label.element.parentNode) {
            label.element.parentNode.removeChild(label.element);
        }
    }
}

export function remove_all_meshes(op, target_position) {
    if (op.mesh != undefined) { // node

        scale_to_zero_and_shift_to_location_then_remove(op, target_position)

    } else if (op.expanded_plane_mesh != undefined) { // plane

        // remove label immediately
        deleteCSS2DLabel(op.expanded_plane_label)
        op.expanded_plane_label = undefined

        let planes = [op.expanded_plane_mesh, op.expanded_plane_background_mesh] // NOTE if do forEach directly on this array rather than declare it first, then preceding code needs semicolon
        planes.forEach(plane => { // NOTE TODO we're doing the onComplete twice, fix
            new TWEEN.Tween(plane.position)
                .to(target_position, TWEEN_MS) 
                .easing(TWEEN_EASE)
                .start();

            new TWEEN.Tween(plane.scale)
                .to({x:0, y:0, z:0}, TWEEN_MS) 
                .easing(TWEEN_EASE)
                .onComplete(() => {
                    scene.remove(op.expanded_plane_mesh)
                    scene.remove(op.expanded_plane_background_mesh)

                    op.expanded_plane_mesh = undefined
                    op.expanded_plane_background_mesh = undefined
                })
                .start();
        })

    }	
    op.children.forEach(c => {remove_all_meshes(c, target_position)})
}

export function nice_name(op) {
	return op.name.slice(0, 10) + "-" + op.node_id.slice(op.node_id.length-4, op.node_id.length)
}


///////////////////////////////
// Label visibility
///////////////////////////////

export function populate_labels_pool() {
    globals.labels_pool = []
    globals.all_labels = []
    let N_LABELS_IN_POOL = 400
    for (let i=0; i<N_LABELS_IN_POOL; i++) {
    
        const div = document.createElement( 'div' );
        div.className = 'label';    
        div.style.backgroundColor = 'transparent';

        for (let i=0; i<8; i++) {
            let span = document.createElement('span')
            div.appendChild(span)
        }
    
        const label = new CSS2DObject( div );
        // label.frustumCulled = false

        // label.element.style.display = "none" // this wasn't doing it, have to set label.visible
        label.visible = false
    
        label.position.set( Math.random(),0,Math.random()-2 );
        
        label.center.set( .5, 1.1 ); // above node, centered horizontally
        let label_id = i
        label.label_id = label_id

        scene.add(label)
    
        globals.labels_pool.push(label)
        globals.all_labels.push(label)
    }
}

export const dim_color_lookup = {
    "unknown": "grey",
    "features": "rgb(30, 140, 100)",
    "spatial":"rgb(20, 30, 180)",
    // "batch":"purple"
    "batch":"grey"
}
// grab label from pool, fill it out w op's info and position it at op's location
function assign_label_to_op(op) {
    let label = globals.labels_pool.pop()

    if (label) {
        // label.position.set(op.x, 0, op.y)
        label.position.set(0, 0, 0) 
        // note there are two ways to set position: center.set works in screen space, position.set works in scene space. We first align how
        // we want in px space, then set in world space so stays nice through zooms. Eg for nodes align to bottom of text, then place that bottom
        // of text directly above the sphere in scene coords
        op.mesh.add(label)

        label.center.set( .5, 0); // centered horizontally w node. Screen coords

        ////
        if (["mod_out", "fn_out"].includes(op.node_type) || op.is_global_input){
            label.element.style["font-size"] = "11px"
            if (op.is_activation_volume) {
                label.position.x -= (op.activation_volume_specs.depth/2)
                label.position.z += (op.activation_volume_specs.height*.6)
            } else {
                label.position.z += .05
            }
            if ("dim_types" in op) {
                let spans = label.element.children

                let spans_ix = 0
                spans[0].innerText = "("; spans_ix += 1
                spans[0].style.display = 'inline'
                op.shape.forEach((s,i) => {
                    let dim_type = op.dim_types[i]
                    let color = dim_color_lookup[dim_type]
    
                    let span = spans[spans_ix]; spans_ix+= 1
                    span.style.display = 'inline'
                    span.style.color = color;
                    if (i < (op.shape.length-1)) s += ', '
                    span.innerText = s; 
                })
                let last_span = spans[spans_ix]

                last_span.innerText = ")"
                last_span.style.display = "inline"

            } else {
                let spans = label.element.children
                spans[0].innerText = "("+op.shape+")"
                spans[0].style.display = 'inline'
                spans[0].style.color = dim_color_lookup["unknown"];
            }
        } else if (["function", "module"].includes(op.node_type)) {
            label.element.style["font-size"] = "12px"
            label.center.set( .5, 1); // centered horizontally w node, aligns w bottom of text to node center vertically
            label.position.z -= .08 // scene coords
            let spans = label.element.children
            let first_span = spans[0]
            first_span.style.display = 'inline'
            first_span.style.color = 'rgb(50,60,60)'

            if (op.name=="reshape*") { // special reshape group
                const icon = document.createElement('i');
                icon.className = "fa-solid fa-shuffle"
                icon.style.color = "grey"
                first_span.appendChild(icon) // TODO we need to be deleting this now also
            } else { // standard node

                // first_span.innerText = op.name.slice(0, 10)
                let text = formatText(op.name)
                if ("fn_metadata" in op) {
                    if ("kernel_size" in op.fn_metadata) {
                        let k = op.fn_metadata.kernel_size
                        k = k.includes(",") ? k : "("+k+"x"+k+")"
                        k = k.replace(", ", "x")
                        text += " "+k
                    }
                    if ("groups" in op.fn_metadata) {
                        if (parseInt(op.fn_metadata.groups)>1) {
                            text += "<br>groups: "+op.fn_metadata.groups
                        }
                    }
                }
                
                if (("action_along_dim_type" in op) && (op.action_along_dim_type!=="unknown")) {
                    text += ("<br>("+op.action_along_dim_type+")")
                }

                first_span.innerHTML = text

            }

        } 
        ///////
        
        label.visible = true
        label.element.style.visibility = 'visible'
        op.active_node_label = label
        label.current_op = op
    } else {
      console.log("label pool empty")
    }
}
function is_uc(char) {
    return char===char.toUpperCase()
}
function is_lc(char) {
    return char===char.toLowerCase()
}
function formatText(text) { // chatGPT
    let formattedText = '';
    let start = 0;

    // Helper function to find the natural breakpoint
    function findNaturalBreakpoint(str, start, maxLen) {
        let breakpoints = []
        for (let i = start + 1; i <= start + maxLen; i++) {
            if (
                str[i] === '_' || 
                (str[i+1] && is_uc(str[i]) && is_lc(str[i+1])) ||
                (!isNaN(str[i - 1]) && isNaN(str[i]))
                ) {
                // return i;
                breakpoints.push(i)
            }
        }
        if (breakpoints.length>0) {
            return breakpoints[breakpoints.length-1]
        } else {
            return start + maxLen; // Default to the max length if no breakpoint is found
        }
    }

    while (start < text.length) {
        if (text.length - start <= 14) {
            // If the remaining text is less than or equal to 12, just append it
            formattedText += text.slice(start);
            break;
        } else {
            // Find a natural breakpoint between the 8th and 12th character
            let breakPoint = findNaturalBreakpoint(text, start, 14);
            formattedText += text.slice(start, breakPoint) + '<br>';
            start = breakPoint;
        }
    }

    return formattedText;
}

function remove_label_from_op_and_return_to_pool(op) {
    if (op.active_node_label != undefined) {
        let label = op.active_node_label
        op.mesh.remove(label) // remove from three.js Group
    
        // label.element.style.display = 'none' // doesn't work, that wasted an hour
        label.visible = false // i think this overrides manually setting it. Have to do it this way. 
        label.element.style.opacity = 1

        // set all spans as display none. Can use the display==none technique here, though not on the style of the base div element (that is overridden by label.visible)
        let spans = label.element.children
        for (let i=0; i<spans.length; i++) {
            let span = spans[i]
            span.style.display = 'none'
            span.style.color = 'black'
            span.innerText = ""
        }
    
        globals.labels_pool.push(label)
        op.active_node_label = undefined
        label.current_op = undefined
    }
}

let interesting_ops = ["matmul", "cat"]
function is_interesting_op(op) {
    return (
        op.n_params>0 ||
        interesting_ops.includes(op.name)
        )
}

function update_nodes_labels() {
    console.log("update nodes labels")
    let [h_width, h_height, cx, cz] = get_main_window_position()
    let bh = 3; let bv = 1.5 // scaling to give buffer to count as 'on screen' to put labels in place before they scroll into view.
    let screen_left = cx-h_width*bh; let screen_right = cx+h_width*bh; let screen_top = cz+h_height*bv; let screen_bottom = cz-h_height*bv
    globals.ops_of_visible_nodes.forEach(op => {
      let is_onscreen = (op.x > screen_left) && (op.x < screen_right) && (op.y>screen_bottom) && (op.y<screen_top)
    //   let zoomed_enough = (globals.camera.zoom > 22 || (globals.camera.zoom > 18 && (op.node_type=="function" || op.node_type=="module")))
      let zoomed_enough = (globals.camera.zoom > 30 || 
                            (globals.camera.zoom > 15 && is_interesting_op(op))
                            )
      if (is_onscreen && zoomed_enough && op.should_draw) {
        if (!op.active_node_label) {
            assign_label_to_op(op)
        }
      } else {
        remove_label_from_op_and_return_to_pool(op)
      }
    })

    // only needed after collapse or expansion, not during panning. Could be separate fn but shouldn't be expensive bc not too many in all_labels
    globals.all_labels.forEach(label => {
        if (label.current_op && !label.current_op.is_currently_visible_node) {
            remove_label_from_op_and_return_to_pool(label.current_op)
        }
    })

    // 
    hide_overlapping_labels()
  }


function hide_overlapping_labels() {
    /*
    this part is not streamlined. We're using two approaches. Nodes use labels pool. Planes get their own labels which the keep all the time.
    planes labels use the overlap detection below, which works for them reliably now. Nodes use the div.getBoundingBox approach, also below. 
    We're first checking for overlap within planes labels using their apparatus, then using the planes labels to hide overlapping nodes labels,
    then comparing nodes labels w eachother. Ideally we'd have one labels pool, sort it by priority, cycle through from each side always taking the
    higher priority one. Not for perfs sake, but for sanity as we're now maintaining two ways of getting labels, and two ways of detecting overlap.
    */
    let nodes_labels = globals.all_labels.filter(l => l.current_op)

    let planes_labels = globals.ops_of_visible_planes.filter(op => {
        let show_plane_label = (globals.camera.zoom > 60) || 
            (globals.camera.zoom > 30 && op.n_ops > 6) || 
            (globals.camera.zoom > 20 && op.n_ops > 12) || 
            (globals.camera.zoom > 7 && op.n_ops > 24)
        return show_plane_label
    }).map(op => op.expanded_plane_label)

    let active_labels = nodes_labels//.concat(planes_labels)
    
    // Reset all labels to be visible initially
    active_labels.forEach(l => {
        // l.element.style.visibility = 'visible'
        l.visible = true
        l.is_hidden = false
        l.element.style.opacity = 1
    })
    planes_labels.forEach(l => {
        // l.element.style.visibility = 'visible'
        // l.visible = true // can't do this, they were just marked for overlap TODO consolidate the flags here, just use is_hidden and opacity,
        // don't use visible anymore
        l.is_hidden = false
        l.element.style.opacity = 1
    })

    let to_hide = []

    // Check for overlap w plane labels and node labels
    for (let i = 0; i < nodes_labels.length; i++) {
        for (let j = 0; j < planes_labels.length; j++) {
            let l1 = nodes_labels[i]
            let l2 = planes_labels[j]
            if (l2.visible) { // if plane is visible
                if (doDivsIntersect(l1.element, l2.element)) { // if overlap, hide node label
                    // l1.element.style.visibility = 'hidden'
                    l1.is_hidden = true
                    to_hide.push(l1)
                } 
            }
        }
    }
    
    // Iterate through the labelRects to check for overlaps
    // active_labels.sort((a,b)=>a.current_op.n_params - b.current_op.n_params)
    // more params gets precedence
    active_labels.sort((a, b) => {
        const aParams = a.current_op?.n_params ?? -Infinity; // Treat undefined as a very small value
        const bParams = b.current_op?.n_params ?? -Infinity; // Treat undefined as a very small value
    
        return aParams - bParams;
    });
    // TODO should also sort by sparkflow to decide overlap btwn tensor nodes
    
    for (let i = 0; i < active_labels.length; i++) {
        // for (let j = i + 1; j < active_labels.length; j++) {
        for (let j = active_labels.length-1; j > i; j--) {
            let l1 = active_labels[i]
            let l2 = active_labels[j]
            if (!l1.is_hidden && !l2.is_hidden) { // if both are still visible
                if (doDivsIntersect(l1.element, l2.element)) { // if overlap, hide one
                    // l1.element.style.visibility = 'hidden'
                    to_hide.push(l1)
                    l1.is_hidden = true
                } 
            }
        }
    }
    to_hide.forEach(label => {
        label.element.style.opacity = 0 //.3
        // label.visible = false

    })
}

function doDivsIntersect(div1, div2) {
    // Get bounding rectangles of both divs
    const rect1 = div1.getBoundingClientRect();
    const rect2 = div2.getBoundingClientRect();

    // Check if the rectangles overlap
    const overlap = !(
        rect1.right < rect2.left ||   // rect1 is to the left of rect2
        rect1.left > rect2.right ||   // rect1 is to the right of rect2
        rect1.bottom < rect2.top ||   // rect1 is above rect2
        rect1.top > rect2.bottom      // rect1 is below rect2
    );

    return overlap;
}
    
// from chatgpt
const getScreenCoordinates = (object) => {
    const vector = new THREE.Vector3();
    object.getWorldPosition(vector);
    vector.project(globals.camera);

    const x = (vector.x * 0.5 + 0.5) * globals.mount.clientWidth;
    const y = (vector.y * -0.5 + 0.5) * globals.mount.clientHeight;
    return { x, y, v:vector };
};

// Function to calculate bounding box of a label
const calculateBoundingBox = (label, coords) => {
    const padding = 6 //2; // Small padding value to ensure overlap detection accuracy
    const width = label.element.offsetWidth + padding;
    const height = 8 //label.element.offsetHeight + padding;
    // Adjust x and y to represent the center position
    const x = coords.x - width / 2;
    const y = coords.y - height / 2;
    return { x, y, width, height, label };
};

const checkOverlap = (rect1, rect2) => {
    return (
        rect1.x < rect2.x + rect2.width &&
        rect1.x + rect1.width > rect2.x &&
        rect1.y < rect2.y + rect2.height &&
        rect1.y + rect1.height > rect2.y
    );
};

function update_planes_labels() { 

    // Only consider if within distance
    // TODO only do if on screen
    let consider_drawing = []
    globals.ops_of_visible_planes.forEach(op => {
        if (globals.camera.zoom > 60 || 
            globals.camera.zoom > 30 && op.n_ops > 6 || 
            globals.camera.zoom > 20 && op.n_ops > 12 || 
            globals.camera.zoom > 7 && op.n_ops > 24) {
            consider_drawing.push(op)
        } else {
            // op.expanded_plane_label.element.style.display = 'none';
            op.expanded_plane_label.visible = false;
        }
    })

    // Of those within distance, remove if overlap
    // Reset all labels to be visible initially
    consider_drawing.forEach(op => {
        // op.expanded_plane_label.element.style.display = 'block'; // doesn't work, have to set visible
        op.expanded_plane_label.visible = true;
        op.expanded_plane_label.element.style.opacity = 1
    });
    
    const labelRects = consider_drawing.map(op => {
        const coords = getScreenCoordinates(op.expanded_plane_label);
        let bb = calculateBoundingBox(op.expanded_plane_label, coords);
        bb.name = op.name
        return bb
    });
    
    // Iterate through the labelRects to check for overlaps
    for (let i = 0; i < labelRects.length; i++) {
        for (let j = i + 1; j < labelRects.length; j++) {
            const rect1 = labelRects[i];
            const rect2 = labelRects[j];
            if (checkOverlap(rect1, rect2)) {
                let to_hide = low_priority_names.includes(rect1.name) ? rect1 : rect2
                // to_hide.label.element.style.display = 'none'; // Hide the overlapping label
                to_hide.label.visible = false; // Hide the overlapping label
            }
        }
    }

}

export function update_labels() {
    update_planes_labels()

    update_nodes_labels()
}

///////////////////////////////
// utils
///////////////////////////////

export function get_main_window_position() {
    const h_width = globals.camera.right / globals.camera.zoom;
    const h_height = globals.camera.top / globals.camera.zoom;

    let cx = globals.camera.position.x
    let cz = globals.camera.position.z
    
    return [h_width, h_height, cx, cz];
  }

export function mark_attr(op, attr, value) {
    // mark this op and all its children
    op[attr] = value
    op.children.forEach(c => {
        mark_attr(c, attr, value)
    })
}

export function interp(xPoint, breakpoints, values) { // like numpy interpolate. from chatgpt
	// Find the first breakpoint larger than the xPoint
	const upperIndex = breakpoints.findIndex(breakpoint => breakpoint > xPoint);
	if (upperIndex === -1) {
		return values[values.length - 1]; // Return the last value if xPoint is beyond the range
	}
	if (upperIndex === 0) {
		return values[0]; // Return the first value if xPoint is before the range
	}

	// Perform linear interpolation
	const lowerIndex = upperIndex - 1;
	const lowerBreakpoint = breakpoints[lowerIndex];
	const upperBreakpoint = breakpoints[upperIndex];
	const lowerValue = values[lowerIndex];
	const upperValue = values[upperIndex];

	const t = (xPoint - lowerBreakpoint) / (upperBreakpoint - lowerBreakpoint);
	return lowerValue + t * (upperValue - lowerValue);
}

// edges
export function get_ns(op, uns_or_dns) {
    let ns = op[uns_or_dns].map(nid => globals.nodes_lookup[nid])
    ns = ns.filter(n => n != undefined) // was getting lots of undefineds from removing aux outputs
    return ns
}
// get nodes fns dominate timing
export function get_downstream_peer_nodes(base_op) {
    let all_dns = get_ns(base_op, "dns")
    // let just_peer_dns = all_dns.filter(dn => dn.parent_op.name==base_op.parent_op.name)
    // BUG REPORT i am an idiot. check out that filter, what if have same name ??? eg Sequential??? why did i do it that way? 2.5 hr bug.
    let just_peer_dns = all_dns.filter(dn => dn.parent_op==base_op.parent_op)
    return just_peer_dns
}
export function get_upstream_peer_nodes(base_op) {
    let all_uns = get_ns(base_op, "uns")
    // let just_peer_uns = all_uns.filter(un => un.parent_op.name==base_op.parent_op.name)
    let just_peer_uns = all_uns.filter(un => un.parent_op==base_op.parent_op)
    return just_peer_uns
}

export function get_downstream_nodes_from_group(base_op, ops) {
    return ops.filter(o => base_op.dns.includes(o.node_id))
}
export function get_upstream_nodes_from_group(base_op, ops) {
    return ops.filter(o => base_op.uns.includes(o.node_id))
}

// TODO consolidate these
export function mark_all_mods_of_family_as_collapsed(op, family, to_remove_container){
    if (op.node_type=="module" && op.name==family && !op.collapsed) {
      op.collapsed = true
      to_remove_container.push(op)
    }
    op.children.forEach(c => mark_all_mods_of_family_as_collapsed(c, family, to_remove_container))
}
export function mark_all_mods_of_family_as_expanded(op, family, to_expand_container){
    if (op.node_type=="module" && op.name==family && op.collapsed) {
      op.collapsed = false
      to_expand_container.push(op)
    }
    op.children.forEach(c => mark_all_mods_of_family_as_expanded(c, family, to_expand_container))
}


export function mark_all_mods_past_depth_as_collapsed(level){
    let to_collapse_container = []
    let to_expand_container = []
    function _mark_all_mods_past_depth_as_collapsed(o){
        if (o.node_type=="module") {
            if (o.depth>=level && !o.collapsed) {
                o.collapsed = true
                to_collapse_container.push(o)
            } else if (o.depth<level && o.collapsed) {
                o.collapsed = false
                to_expand_container.push(o)
            }
            o.children.forEach(c => _mark_all_mods_past_depth_as_collapsed(c))
        } 
    }
    _mark_all_mods_past_depth_as_collapsed(globals.nn)

    return [to_collapse_container, to_expand_container]
}

// stats, tooltips number formatting
export function formatNumParams(num) {
    if (num >= 1e9) {
      return (num / 1e9).toFixed(1) + 'b';
    } else if (num >= 1e6) {
      return (num / 1e6).toFixed(1) + 'm';
    } else if (num >= 1e3) {
      return (num / 1e3).toFixed(1) + 'k';
    } else {
      return num.toFixed(1).toString();
    }
}
export function formatMemorySize(numBytes) {
    const ONE_KB = 1024;
    const ONE_MB = 1024 * ONE_KB;
    const ONE_GB = 1024 * ONE_MB;

    if (numBytes >= ONE_GB) {
        return (numBytes / ONE_GB).toFixed(1) + ' GB';
    } else if (numBytes >= ONE_MB) {
        return (numBytes / ONE_MB).toFixed(1) + ' MB';
    } else if (numBytes >= ONE_KB) {
        return (numBytes / ONE_KB).toFixed(1) + ' KB';
    } else {
        return Math.round(numBytes) + ' bytes';
    }
}

export function formatLatency(ms) {
    if (ms >= 1000) {
      // If the time is more than a second, format it as seconds with one decimal
      return (ms / 1000).toFixed(1) + 's';
    } else if (ms >= 1) {
      // If the time is more than a millisecond, return in milliseconds
      return Math.round(ms) + 'ms';
    } else {
      // If the time is less than a millisecond, return in microseconds
      return Math.round(ms * 1000) + 'µs';
    }
  }
  
export function save_current_state() {

    let properties_to_copy = ["name", "collapsed", "mod_identifier"]

    let expanded_ops = globals.ops_of_visible_planes.map(op => {
        let copy = {}
        properties_to_copy.forEach(p => copy[p]=op[p])
        return copy
    })

    let trace_name = globals.nn.trace_metadata.name

    let saved_settings = {
        "name":trace_name,
        "expanded_ops":expanded_ops
    }
    saveCompressedJSON(saved_settings, trace_name)
}

export function load_saved_settings(nn, saved_settings) {
    Object.keys(globals.nodes_lookup).forEach(nid => {
        let op = globals.nodes_lookup[nid]
        op.collapsed = true
    })

    nn.collapsed = false // root
    saved_settings.expanded_ops.forEach(expanded_op => {
        let mod = globals.modules_lookup_by_identifier[expanded_op.mod_identifier] // root not in there
        if (mod) {
            mod.collapsed = false
        }
    })
}

function saveCompressedJSON(jsonObject, trace_name) { // chatgpt
    let filename = `darkspark_defaults_${trace_name}.json.gz`

    // Step 1: Convert the JSON object to a string
    const jsonString = JSON.stringify(jsonObject);

    // Step 2: Compress the JSON string using pako.gzip
    const compressed = pako.gzip(jsonString);

    // Step 3: Create a Blob from the compressed data
    const blob = new Blob([compressed], { type: 'application/gzip' });

    // Step 4: Create a download link and trigger it
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link); // Needed for Firefox
    link.click();
    document.body.removeChild(link); // Clean up
}


export function saveMinimapAsImage(renderer, camera) {
    // Render the current scene from the camera's perspective
    globals.minimap_window_plane.visible = false
    renderer.render(scene, camera);
    
    // Get the data URL of the canvas
    const imgData = renderer.domElement.toDataURL("image/png");
  
    // Create a temporary link element to trigger the download
    const link = document.createElement('a');
    link.href = imgData;
    let trace_name = globals.nn.trace_metadata.name
    link.download = `darkspark_thumbnail_${trace_name}.png`;
    link.click();

    globals.minimap_window_plane.visible = true
    renderer.render(scene, camera);

  }

export const transformers_str_w_emoji = '\u{1F917} Transformers';
export const diffusers_str_w_emoji = '\u{1F917} Diffusers';