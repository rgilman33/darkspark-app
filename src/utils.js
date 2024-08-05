import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer';

import * as TWEEN from '@tweenjs/tween.js';

///////////////////////////////
// globals
///////////////////////////////

export let globals = {
    max_depth: undefined,
    curves_lookup: {},
    nodes_lookup: {},

    ops_of_visible_nodes: [], // convenience, for drawing and updating labels
    ops_of_visible_planes: [],
    camera: undefined,
    nn: undefined,
    mount: undefined,
}

export let scene = new THREE.Scene();
scene.background = new THREE.Color(...[248, 249, 250].map(d => d/255));


///////////////////////////////
// constants
///////////////////////////////

export function get_edge_color(brightness_factor) {
    const edge_color = new THREE.Color(...[33*brightness_factor, 37*brightness_factor, 41*brightness_factor].map(d=>d/255))
    return edge_color
}

export const node_color = new THREE.Color(...[22, 66, 91].map(d=>d/255))
export const node_highlight_color = new THREE.Color(...[58, 124, 165].map(d=>d/255))

// const scene_background_color = new THREE.Color(...[248, 249, 250].map(d => d/255));
export const plane_color = new THREE.Color(...[248, 249, 250].map(d => d/255));
export const white_color = new THREE.Color(1,1,1);
export const plane_color_darker = new THREE.Color(...[228, 229, 230].map(d => d/255));
export const plane_outline_color = new THREE.Color(...[58, 124, 165].map(d=>d/255))

export const DEBUG = true

export const CURVE_N_PTS = 20 //50

export const MAX_SPHERE_SIZE = .32

export const low_priority_names = ["Sequential"] // will be removed first when label collisions happen

//
const sphere_geometry = new THREE.CircleGeometry(1, 12);
const square_geometry = new THREE.PlaneGeometry(1, 1);


export const CLICKABLE_LAYER = 1
export const TWEEN_MS = 600
export const TWEEN_EASE = TWEEN.Easing.Linear.None

export const plane_highlight_color = new THREE.Color(...[228, 229, 230].map(d => d/255));;

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
export function get_line_from_pts(pts, linewidth, color) {
	const line_geometry = new THREE.BufferGeometry().setFromPoints(pts);
	const material = new THREE.LineBasicMaterial( { color: color, linewidth:linewidth } );
	const lineObject = new THREE.Line(line_geometry, material);

	return lineObject
}

export function get_edge_pts(n0, n1) {
    let same_y = DEBUG ? n0.y_unshifted==n1.y_unshifted : n0.y==n1.y 
    let x_dist = n1.x - n0.x
    let pt1 = {x:n0.x, y:0, z:n0.y} // n0
    let pt2 = {x:n1.x, y:0, z:n1.y} // n1
    let pts

    if (same_y) { // flat
        pts = get_pts_for_flat_line(pt1, pt2)
    } else { // has vertical part
        if (x_dist > 1) { // elbow. Compound curve
            // if ((n0.respath_dist == n1.respath_dist) || n0.is_last_in_line){ // normal elbow TODO this needs work. Mark it in layout_engine. 
                if ( n0.is_last_in_line){ // normal elbow 
                // Shouldn't this only be is_last_in_line now? 
                let elbow = {x:n1.x-1, y:0, z:n0.y}
                let flat_pts = get_pts_for_flat_line(pt1, elbow)
                let curve_pts = get_curve_pts(elbow, pt2, CURVE_N_PTS-2)
                pts = flat_pts.concat(curve_pts)    
            } else { // pre elbow // TODO pre-elbow also needs to be added to occ blocking in layout engine
                let elbow = {x:n0.x+1, y:0, z:n1.y}
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
    if (DEBUG){
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
            return _get_node_color_non_debug(n)
        }
    } else {
        return _get_node_color_non_debug(n)
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

export function get_plane_color(op, _max_depth) {
	let d = op.depth
	let d_range = [0, _max_depth]
	// let c2 = [248, 249, 250]
	// let c1 = [233, 236, 239]
	// let c1 = [173, 181, 189]
	let c1 = [173, 181, 189]
	let c2 = [248, 249, 250]
	// let c2 = [108, 117, 125]

	c1 = c1.map(d => d/255)
	c2 = c2.map(d => d/255)
	let r = interp(d, d_range, [c1[0], c2[0]])
	let g = interp(d, d_range, [c1[1], c2[1]])
	let b = interp(d, d_range, [c1[2], c2[2]])
	const color = new THREE.Color(r, g, b)
	return color
}

export function scale_sphere(sphere, n_ops) {
	let scalar = interp(n_ops, [0,1,2,100], [.12, .12, .14, MAX_SPHERE_SIZE])
	sphere.scale.x *= scalar
	sphere.scale.y *= scalar
	sphere.scale.z *= scalar
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

export function get_text(op) {
	const div = document.createElement( 'div' );
	div.className = 'label';
    let text = ''
    let color_lookup = {
        "unknown": "grey",
        "features": "green",
        "spatial":"blue",
        "batch":"purple"
    }
    // if (op.is_tensor_node){
    if (["mod_out", "fn_out"].includes(op.node_type) || op.is_global_input){
        if ("dim_types" in op) {
            let span = document.createElement('span');
            span.innerText = "("
            div.appendChild(span)
            op.shape.forEach((s,i) => {
                let dim_type = op.dim_types[i]
                let color = color_lookup[dim_type]

                let span = document.createElement('span');
                span.style.color = color;
                if (i < (op.shape.length-1)) s += ', '
                span.innerText = s; 
                div.appendChild(span);
            })
            let end_span = document.createElement('span');
            end_span.innerText = ")"
            div.appendChild(end_span)
        } else {
            text = op.input_shapes[0]
            div.innerHTML = text
        }
    } else if (["function", "module"].includes(op.node_type)) {
        text = op.name.slice(0, 10)
        if ("fn_metadata" in op) {
            if ("kernel_size" in op.fn_metadata) {
                let k = op.fn_metadata.kernel_size
                k = k.includes(",") ? k : "("+k+"x"+k+")"
                k = k.replace(", ", "x")
                text += (" "+k)
            }
            if ("groups" in op.fn_metadata) {
                if (parseInt(op.fn_metadata.groups)>1) {
                    text += ("<br>groups: "+op.fn_metadata.groups)
                }
            }
        }
        if ("action_along_dim_type" in op) {
            text += (" ("+op.action_along_dim_type+")")
        }
        // if (op.collapsed_ops){
        //     op.collapsed_ops.forEach(collapsed_op_name => {
        //         text += ("<br>"+collapsed_op_name)
        //     })
        // }
        div.innerHTML = text
    } 

    div.style.display = 'none' // init to none, will show when close enough
	div.style.backgroundColor = 'transparent';

	const label = new CSS2DObject( div );
	label.position.set( 0, 0, 0 );
	// label.center.set( .5, -.5 ); // centers over node
    if (op.node_type=="function" || op.node_type=="module") {
	    label.center.set( .5, 1.1 ); // above node, centered horizontally
    } else { // tensor node
	    label.center.set( .5, -.1 ); // below node, centered horizontally
    }

	return label
}

export function get_sphere_group(n){
    
    if (((n.node_type=="function" || 
        n.node_type=="module" || 
        n.is_global_input || 
        n.node_type=="fn_out" || 
        n.node_type=="mod_out") &&
        !n.node_is_extraneous_io) || DEBUG 
        ) {
        n.should_draw = true
    } else {
        n.should_draw = false
    }

    let sphere
    let color = get_node_color(n)
    if (n.node_type=="function" || n.node_type=="module") {
        sphere = new THREE.Mesh( sphere_geometry, new THREE.MeshBasicMaterial( { color: color } ) )
    } else {
        sphere = new THREE.Mesh( square_geometry, new THREE.MeshBasicMaterial( { color: color } ) )
    }

    sphere.rotation.x = -Math.PI / 2; // Rotate 90 degrees to make it face upward
    sphere.position.y += .1 // shift towards camera so doesn't overlap w edges

    scale_sphere(sphere, n.n_ops)
    // sphere.layers.set(CLICKABLE_LAYER)

    let group = new THREE.Group();
    group.add(sphere)

    if (n.should_draw){
        let text = get_text(n)
        group.add(text)
        n.node_label = text

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
    } else {
        group.children.forEach(o => {
            o.visible = false
        })
    }

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
        if ("node_label" in op) {
            let label = op.node_label
            remove_css2d_object(label)
        }
    }
    op.node_label = undefined
    scene.remove(op.mesh)
    op.mesh = undefined
}
export function remove_css2d_object(label) {
    if (label){
        if ("parentNode" in label.element) {
            if (label.element.parentNode != null) {
                label.element.parentNode.removeChild(label.element);
            }
        }
    }
    scene.remove(label)
}

export function remove_plane(op) {
    scene.remove(op.expanded_plane_label)
    scene.remove(op.expanded_plane_mesh)
    scene.remove(op.expanded_plane_background_mesh)

    op.expanded_plane_mesh = undefined
    op.expanded_plane_background_mesh = undefined
    op.expanded_plane_label = undefined
}

export function remove_all_meshes(op, target_position) {
    if (op.mesh != undefined) { // has node
        // dumb manual hack. Otherwise these are all showing, regardless of distance. 
        // I think tween messes w distance calc for camera, similar to frustum culling being messed up when transition edges
        if (op.node_label != undefined) {
            if (op.node_label.element != undefined) {
                op.node_label.element.innerText = "" 
            }
        }
        new TWEEN.Tween(op.mesh.position)
                .to(target_position, TWEEN_MS) 
                .easing(TWEEN_EASE)
                .onComplete(() => {
                    remove_sphere(op)
                })
                .start();
    } else if (op.expanded_plane_mesh != undefined) { // plane
        [op.expanded_plane_mesh, op.expanded_plane_background_mesh].forEach(plane => {
            new TWEEN.Tween(plane.position)
                .to(target_position, TWEEN_MS) 
                .easing(TWEEN_EASE)
                .start();

            new TWEEN.Tween(plane.scale)
                .to({x:0, y:0, z:0}, TWEEN_MS) 
                .easing(TWEEN_EASE)
                .onComplete(() => {
                    remove_plane(op)
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

export function update_labels() {
    globals.ops_of_visible_nodes.forEach(op => {
        if ((globals.camera.zoom > 30 || (globals.camera.zoom > 20 && (op.node_type=="function" || op.node_type=="module"))) 
                && op.should_draw 
            ) {
            if (op.node_label != undefined) {
                op.node_label.element.style.display = 'block'
            }
        } else {
            if (op.node_label != undefined) {
                op.node_label.element.style.display = 'none'
            }
        }
    })


    // TODO put all labels together, sort by priority, then draw whatever can

    // Only consider if within distance
    let consider_drawing = []
    globals.ops_of_visible_planes.forEach(op => {
        if (globals.camera.zoom > 60 || 
            globals.camera.zoom > 30 && op.n_ops > 6 || 
            globals.camera.zoom > 20 && op.n_ops > 12 || 
            globals.camera.zoom > 7 && op.n_ops > 24) {
            consider_drawing.push(op)
        } else {
            op.expanded_plane_label.element.style.display = 'none';
        }
    })

    // Of those within distance, remove if overlap
    // from chatgpt
    const getScreenCoordinates = (object, cam) => {
        const vector = new THREE.Vector3();
        object.getWorldPosition(vector);
        vector.project(cam);
        const x = (vector.x * 0.5 + 0.5) * globals.mount.clientWidth;
        const y = (vector.y * -0.5 + 0.5) * globals.mount.clientHeight;
        return { x, y };
    };
    
    // Function to calculate bounding box of a label
    const calculateBoundingBox = (label, coords) => {
        const padding = 2; // Small padding value to ensure overlap detection accuracy
        const width = label.element.offsetWidth + padding;
        const height = label.element.offsetHeight + padding;
        // Adjust x and y to represent the center position
        const x = coords.x - width / 2;
        const y = coords.y - height / 2;
        return { x, y, width, height, label };
    };
    
    // Reset all labels to be visible initially
    consider_drawing.forEach(op => {
        op.expanded_plane_label.element.style.display = 'block';
    });
    
    const labelRects = consider_drawing.map(op => {
        const coords = getScreenCoordinates(op.expanded_plane_label, globals.camera);
        let bb = calculateBoundingBox(op.expanded_plane_label, coords);
        bb.name = op.name
        return bb
    });
    
    const checkOverlap = (rect1, rect2) => {
        return (
            rect1.x < rect2.x + rect2.width &&
            rect1.x + rect1.width > rect2.x &&
            rect1.y < rect2.y + rect2.height &&
            rect1.y + rect1.height > rect2.y
        );
    };
    
    // Iterate through the labelRects to check for overlaps
    for (let i = 0; i < labelRects.length; i++) {
        for (let j = i + 1; j < labelRects.length; j++) {
            const rect1 = labelRects[i];
            const rect2 = labelRects[j];
            if (checkOverlap(rect1, rect2)) {
                let to_hide = low_priority_names.includes(rect1.name) ? rect1 : rect2
                to_hide.label.element.style.display = 'none'; // Hide the overlapping label
            }
        }
    }

}


///////////////////////////////
// utils
///////////////////////////////

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

export function get_downstream_nodes(base_op, ops) {
    return ops.filter(o => base_op.dns.includes(o.node_id))
}
export function get_upstream_nodes(base_op, ops) {
    return ops.filter(o => base_op.uns.includes(o.node_id))
}

export function get_node(nid, ns) {
    return ns.filter(n => n.node_id==nid)[0]
}

export function collapse_to_depth(level) {
    let ops_to_collapse = []
    let ops_to_expand = []
    function gather_ops_for_collapse_and_expansion(op) {
        if (op.depth < level) {
            if (op.children.length>0){
                ops_to_expand.push(op)
                op.children.forEach(c => gather_ops_for_collapse_and_expansion(c))
            }
        } else if (op.depth >= level) {
            ops_to_collapse.push(op)
            op.children.forEach(c => gather_ops_for_collapse_and_expansion(c))
        }
    }
    gather_ops_for_collapse_and_expansion(globals.nn)

    ops_to_collapse.forEach(o => {
        if (o.children.length>0){
            mark_as_collapsed(o, true, false)
            remove_all_meshes(o, {x:o.x, y:0, z:o.y})
        }
    })
    ops_to_expand.forEach(o => {
        if (o.children.length>0){
            mark_as_collapsed(o, false, false)
        }
    })
}

export function mark_as_collapsed(op, is_collapsed, propogate_to_children){
    op.collapsed = is_collapsed
    if (propogate_to_children) {
        op.children.forEach(c => mark_as_collapsed(c, is_collapsed, propogate_to_children))
    }
}

export function mark_all_mods_of_family_as_collapsed(op, family, is_collapsed, to_remove_container){
    if (op.node_type=="module" && op.name==family) {
      op.collapsed = is_collapsed
      to_remove_container.push(op)
    }
    op.children.forEach(c => mark_all_mods_of_family_as_collapsed(c, family, is_collapsed, to_remove_container))
}
