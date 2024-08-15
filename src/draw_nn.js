import * as THREE from 'three';
import * as TWEEN from '@tweenjs/tween.js';

import * as utils from './utils';
import { scene, globals } from "./utils"
import { TWEEN_EASE, TWEEN_MS, CLICKABLE_LAYER, get_sphere_group, white_color, plane_outline_color, get_ns, CURVE_N_PTS } from './utils';
import { act } from 'react';

///////////////////////////////
// Draw nn
///////////////////////////////

export function draw_nn() {
    console.time("draw nodes")
    let camera = globals.camera
    let nn = globals.nn

    let draw_order = 0
    let all_tweens = []

    let PLANE_OUTLINE_W = .02

    // 
    function mark_not_visible(op) {
        op.is_currently_visible_node = false
        op.children.forEach(c => mark_not_visible(c))
    }
    mark_not_visible(nn)

    globals.ops_of_visible_planes = []
    globals.ops_of_visible_nodes = []
    function remove_tensor_square_bc_now_is_actvol(op){
        if (op.collapsed) {
            if (op.is_activation_volume && op.tensor_node_type=="standard_node" && op.mesh != undefined) {
                // wasn't an actvol before but is now
                utils.remove_sphere(op)
            } else if (!op.is_activation_volume && op.tensor_node_type=="act_vol" && op.mesh != undefined) {
                // was prev an actvol but now should be simple square
                utils.remove_sphere(op)
            }
        } else {
            op.children.forEach(c=>remove_tensor_square_bc_now_is_actvol(c))
        }
    }
    remove_tensor_square_bc_now_is_actvol(nn)
    function draw_op(op) {
        if (op.collapsed) { // Nodes
            if (op.mesh == undefined) { // if newly appearing node, create the mesh at the position
                let sphere
                if (op.is_activation_volume){
                    sphere = utils.get_activation_volume(op, op.activation_volume_specs)
                    op.tensor_node_type="act_vol"
                    // sphere.position.x -= (op.activation_volume_specs.depth/2)
                } else {
                    sphere = get_sphere_group(op)
                    op.tensor_node_type="standard_node"
                }

                if (op.originating_position == undefined) { // first init, directly draw at position 
                    sphere.position.x = op.x
                    sphere.position.z = op.y
                    // gently tween in the node as the plane is collapsing
                    if (op.is_in_process_of_collapsing) {
                        let sx = sphere.scale.x; let sy = sphere.scale.y; let sz = sphere.scale.z
                        sphere.scale.x = 0; sphere.scale.y = 0; sphere.scale.z = 0
                        let orig_label = op.node_label.element.innerText
                        op.node_label.element.innerText = "" 

                        all_tweens.push(new TWEEN.Tween(sphere.scale)
                            .to({x:sx, y:sy, z:sz}, TWEEN_MS) 
                            .easing(TWEEN_EASE)
                            .onComplete(() => {
                                op.node_label.element.innerText = orig_label
                            }))
                    }
                } else { // from expanding op
                    sphere.position.x = op.originating_position.x // init at expanding op position, then transition to new position
                    sphere.position.y = op.originating_position.y
                    sphere.position.z = op.originating_position.z

                    all_tweens.push(new TWEEN.Tween(sphere.position)
                        .to({x:op.x, y:0, z:op.y}, TWEEN_MS) 
                        .easing(TWEEN_EASE))
                        
                }
                scene.add(sphere);
                op.mesh = sphere
            } else { // sphere exists, transition to new position
                all_tweens.push(new TWEEN.Tween(op.mesh.position)
                        .to({x:op.x, y:0, z:op.y}, TWEEN_MS) 
                        .easing(TWEEN_EASE))
            }

            op.draw_order_global = draw_order; draw_order += 1
            globals.ops_of_visible_nodes.push(op)
            op.is_currently_visible_node = true
        } else { // Planes
            globals.ops_of_visible_planes.push(op)
            ////////////////////////////////////
            // Draw or shift plane
            if (op.expanded_plane_mesh == undefined) { // new planes, make for first time
                const geometry = new THREE.PlaneGeometry(1, 1, 1, 1); // Width, height, and optional segment counts
                let color = white_color //get_plane_color(op, max_depth)
                const material = new THREE.MeshBasicMaterial({color: color})
                let plane = new THREE.Mesh(geometry, material);
                plane.layers.set(CLICKABLE_LAYER)
                plane.rotation.x = -Math.PI/2

                const background_geometry = new THREE.PlaneGeometry(1, 1, 1, 1); // Width, height, and optional segment counts
                const background_material = new THREE.MeshBasicMaterial({color: plane_outline_color})
                let plane_background = new THREE.Mesh(background_geometry, background_material);
                plane_background.rotation.x = -Math.PI/2
                plane_background.layers.set(CLICKABLE_LAYER)

                if (op.name=="Root") {
                    plane.visible = false
                    plane_background.visible = false
                }

                let [h,w,target_pos] = utils.get_plane_specs(op)
                let BACKGROUND_PLANE_SHIFT_BACK = .01
                if (op.originating_position == undefined) { // first init, draw directly

                    plane.scale.x = w; plane.scale.y = h; plane.scale.z = 1
                    plane.position.x = target_pos.x; plane.position.z = target_pos.z; plane.position.y = target_pos.y

                    plane_background.scale.x = w + PLANE_OUTLINE_W
                    plane_background.scale.y = h + PLANE_OUTLINE_W
                    plane_background.scale.z = 1
                    plane_background.position.x = target_pos.x
                    plane_background.position.z = target_pos.z 
                    plane_background.position.y = target_pos.y -BACKGROUND_PLANE_SHIFT_BACK

                } else { 
                    // from expanding op. Init at expanding op position, then transition to new position
                    // plane
                    plane.position.x = op.originating_position.x
                    plane.position.y = op.originating_position.y
                    plane.position.z = op.originating_position.z

                    plane.scale.x = 0; plane.scale.y = 0; plane.scale.z = 1

                    all_tweens.push(new TWEEN.Tween(plane.position)
                        .to(target_pos, TWEEN_MS) 
                        .easing(TWEEN_EASE))

                    all_tweens.push(new TWEEN.Tween(plane.scale)
                        .to({x:w, y:h, z:1}, TWEEN_MS) 
                        .easing(TWEEN_EASE))

                    // background plane
                    plane_background.position.x = op.originating_position.x
                    plane_background.position.y = op.originating_position.y
                    plane_background.position.z = op.originating_position.z

                    plane_background.scale.x = 0; plane_background.scale.y = 0; plane_background.scale.z = 1

                    all_tweens.push(new TWEEN.Tween(plane_background.position)
                        .to({x:target_pos.x, y:target_pos.y-BACKGROUND_PLANE_SHIFT_BACK, z:target_pos.z}, TWEEN_MS) 
                        .easing(TWEEN_EASE))

                    all_tweens.push(new TWEEN.Tween(plane_background.scale)
                        .to({x:w + PLANE_OUTLINE_W, y:h + PLANE_OUTLINE_W, z:1}, TWEEN_MS) 
                        .easing(TWEEN_EASE))
                }
                
                plane.expanded_op = op
                scene.add(plane);

                plane_background.expanded_op = op
                scene.add(plane_background)

                let group_label = utils.get_group_label(op)
                group_label.position.set(target_pos.x + w/2, target_pos.y, target_pos.z + h/2);
                group_label.center.set(1, 1);

                if (!(op.name=="Root")) {
                    scene.add(group_label)
                }

                op.expanded_plane_mesh = plane
                op.expanded_plane_background_mesh = plane_background
                op.expanded_plane_label = group_label
            } else { // transition existing planes
                let plane = op.expanded_plane_mesh
                let plane_background = op.expanded_plane_background_mesh
                let [h,w,target_pos] = utils.get_plane_specs(op)

                // Foreground plane
                // scale
                all_tweens.push(new TWEEN.Tween(plane.scale)
                    .to({x:w,y:h,z:1}, TWEEN_MS)
                    .easing(TWEEN_EASE))

                // location
                all_tweens.push(new TWEEN.Tween(plane.position)
                    .to(target_pos, TWEEN_MS)
                    .easing(TWEEN_EASE))
                
                // Background plane
                // scale
                all_tweens.push(new TWEEN.Tween(plane_background.scale)
                    .to({x:w+PLANE_OUTLINE_W,y:h+PLANE_OUTLINE_W,z:1}, TWEEN_MS)
                    .easing(TWEEN_EASE))
                // location
                all_tweens.push(new TWEEN.Tween(plane_background.position)
                    .to({x:target_pos.x, y:target_pos.y-.01, z:target_pos.z}, TWEEN_MS)
                    .easing(TWEEN_EASE))

                    
                plane.material.color = utils.get_plane_color(op, globals.max_depth) // depth changes scale

                // label location
                let group_label = op.expanded_plane_label
                let pos = target_pos
                // group_label.position.set(pos.x + w/2, pos.y, pos.z + h/2)
                all_tweens.push(new TWEEN.Tween(group_label.position)
                    .to({x:pos.x + w/2, y:pos.y, z:pos.z + h/2}, TWEEN_MS)
                    .easing(TWEEN_EASE))
            }

            // If expanding op, there will be a sphere to remove
            if (op.mesh != undefined) { utils.remove_sphere(op) }


            ////////////////////////////////////
            // Op is expanded, draw children
            op.children.sort((a,b) => {return a.draw_order - b.draw_order})
            op.children.forEach(c => {
                draw_op(c)
            })
        }
    }
    nn.children.sort((a,b) => {return a.draw_order - b.draw_order})
    draw_op(nn)

    ////////////////// color by op type
    let op_color_lookup = {}
    let feature_detector_ops = ["conv2d", "linear", "scaled_dot_product_attention", "embedding"]
    feature_detector_ops.forEach(n => {
        op_color_lookup[n] = new THREE.Color('green')
    })
    let norm_ops = ["layer_norm", "group_norm"]
    norm_ops.forEach(n => {
        op_color_lookup[n] = new THREE.Color('lightblue')
    })
    let activation_ops = ["silu", "relu", "gelu"]
    activation_ops.forEach(n => {
        op_color_lookup[n] = new THREE.Color('brown')
    })
    let arithmetic_ops = ["add", "mul", "div"]
    arithmetic_ops.forEach(n => {
        op_color_lookup[n] = new THREE.Color('black')
    })

    function op_type_to_color(op) {
        if (op.node_type=="module") {
            return new THREE.Color('grey')
        } else if (op.is_tensor_node) {
            return new THREE.Color('lightgrey')
        } else {
            if (op.name in op_color_lookup) {
                return op_color_lookup[op.name]
            } else {
                return new THREE.Color('lightblue')
            }
        }
    }
    globals.ops_of_visible_nodes.forEach(op => {
        let node = op.mesh.children[0]
        node.material.color = op_type_to_color(op)
    })

    // ///////////////////////
    // // color by continuous
    // let colorby_values = []
    // // let colorby_attr = "latency"
    // // let colorby_attr = "max_memory_allocated"
    // // let colorby_attr = "incremental_memory_usage"
    // let colorby_attr = "n_params"
    // globals.ops_of_visible_nodes.forEach(op => {
    //     if (colorby_attr in op) {
    //         colorby_values.push(op[colorby_attr])
    //     }
    // })
    // function value_adjuster(v) {
    //     // return Math.sqrt(s) 
    //     return v 
    // }
    // colorby_values = colorby_values.map(s => {
    //     return value_adjuster(s)
    // })
    // let _max = Math.max(...colorby_values)
    // let _min = Math.min(...colorby_values)
    // function normalize_colorby(v) {
    //     let normalized = (value_adjuster(v) - _min) / (_max - _min)
    //     return normalized
    // }
    // function colorby_continuous(op) {
    //     if (colorby_attr in op) {
    //         let l = normalize_colorby(op[colorby_attr])
    //         return new THREE.Color(l, .3, .3)
    //     } else {
    //         return new THREE.Color('grey')
    //     }
    // }
    // globals.ops_of_visible_nodes.forEach(op => {
    //     let node = op.mesh.children[0]
    //     node.material.color = colorby_continuous(op)
    // })
    // /////////////


    console.timeEnd("draw nodes")
    
    let edges = []
    let already_added = {}
    function add_edge_btwn_op_and_downstream_ops(op) {
        let stack = [op];

        while (stack.length > 0) {
            let current_op = stack.pop();
            let downstream_nodes = get_ns(current_op, "dns").filter(n => n.is_currently_visible_node)
            
            downstream_nodes.forEach(dn => {
                let edge_id = current_op.node_id + dn.node_id;
                if (!already_added[edge_id]) {
                    edges.push([current_op, dn, edge_id]);
                    already_added[edge_id] = true
                    stack.push(dn);
                }
            });
        }
    }

    globals.ops_of_visible_nodes.sort((a,b)=> a.x - b.x)
    let start_nodes = globals.ops_of_visible_nodes.filter(n => n.uns.length==0)
    start_nodes.sort((a,b) => a.input_priority - b.input_priority)

    console.time("draw edges, compute edges")
    start_nodes.forEach(n => {
        add_edge_btwn_op_and_downstream_ops(n)
    })
    console.timeEnd("draw edges, compute edges")

    console.time("draw edges, actually draw them")


    /////////////////////////////////////////////
    // Draw edges
    /////////////////////////////////////////////

    // get sparkflow normalization info
    let sparkflows_raw = []
    edges.forEach(e => {
        let n0 = e[0]; let n1 = e[1]
        if ("sparkflow" in n0) {
            sparkflows_raw.push(n0.sparkflow)
        } else if ("sparkflow" in n1) {
            sparkflows_raw.push(n1.sparkflow)
        }
    })
    function sparkflow_adjuster(s) {
        return Math.sqrt(s)  // as if edges are round like thick wires, so as flow increases diameter increase w sqrt of flow not linear
    }
    let sparkflows = sparkflows_raw.map(s => {
        return sparkflow_adjuster(s)
    })
    let max_sparkflow = Math.max(...sparkflows)
    let min_sparkflow = Math.min(...sparkflows)
    function normalize_sparkflow(s) {
        let normalized = (sparkflow_adjuster(s) - min_sparkflow) / (max_sparkflow - min_sparkflow)
        return normalized
    }
    let curves_lookup = globals.curves_lookup

    // init all existing edges in lookup to stale
    Object.keys(curves_lookup).forEach(edge_id => {
        curves_lookup[edge_id].still_exists = false
    })
    // mark edges to keep
    edges.forEach(e => {
        let edge_id = e[2]
        if (curves_lookup[edge_id]) {
            curves_lookup[edge_id].still_exists = true
        }
    })
    
    let new_edges = []; let existing_edges = []

    // remove lines that are no longer used. Recyle line objects when possible for nice transitions
    let to_remove_edges = []
    Object.keys(curves_lookup).forEach(edge_id => {
        if (!curves_lookup[edge_id].still_exists) {
            to_remove_edges.push(edge_id)
        }
    })
    let n_collapsing_edges = 0; let n_just_removed_edges = 0; let n_recycled_edges = 0

    to_remove_edges.forEach(edge_id => {
        let [line_obj, prev_n0_x, prev_n0_y, prev_n1_x, prev_n1_y] = curves_lookup[edge_id].edge_package
        let [n0, n1] = curves_lookup[edge_id].nodes
        if ((n0.terminating_position != undefined) && (n1.terminating_position != undefined)) {
            // collapsing the edges within a collapsing op
            n_collapsing_edges += 1
            let oldPts = line_obj.userData.pts

            let p = n0.terminating_position // will be the same terminating position, as they're all collapsing to same position
            let pts = []
            for (let i=0; i<oldPts.length; i++) {
                pts.push(new THREE.Vector3(p.x, p.y, p.z))
            }
            const oldPositions = oldPts.map(pt => pt.toArray()); const newPositions = pts.map(pt => pt.toArray());

            all_tweens.push(new TWEEN.Tween(oldPositions)
                .to(newPositions, TWEEN_MS)
                .easing(TWEEN_EASE)
                .onUpdate(updatedPoints => {
                    for (let i = 0; i < oldPts.length; i++) {
                        oldPts[i].set(updatedPoints[i][0], updatedPoints[i][1], updatedPoints[i][2]);
                    }
                    line_obj.geometry.setFromPoints(oldPts);
                })
                .onComplete(() => {
                    scene.remove(line_obj)
                    delete curves_lookup[edge_id]
                }))

        } else if ((n0.terminating_position == undefined) && (n1.terminating_position != undefined)) {
            // edges going into collapsing op. Recycle by transfering line obj and creating new entry in curves_lookup. Deleting old entry but keeping curve obj
            let collapsed_op = n1.parent_op

            let new_edge_id = n0.node_id+collapsed_op.node_id
            curves_lookup[new_edge_id] = {}
            curves_lookup[new_edge_id].edge_package = [line_obj, prev_n0_x, prev_n0_y, prev_n1_x, prev_n1_y] // same package as prev, just reassembling
            curves_lookup[new_edge_id].still_exists = true
            curves_lookup[new_edge_id].nodes = [n0, collapsed_op]
            // should get picked up below

            n_recycled_edges += 1

            delete curves_lookup[edge_id]

        } else { // just remove the edge directly. When will this even happen?
            n_just_removed_edges += 1
            scene.remove(line_obj)
            delete curves_lookup[edge_id]
        }
    })

    function get_linewidth_and_color(n0, n1) {

        // Get sparkflow from nodes pair. At least one should be a tensor node
        let sparkflow
        if ("sparkflow" in n0) {
            sparkflow = n0["sparkflow"]
        } else if ("sparkflow" in n1) {
            sparkflow = n1["sparkflow"]
        }
        let zoom_max_linewidth = utils.interp(camera.zoom, [10,50], [2.8, 20]) // max was at five
        // TODO this won't update on zoom scroll, only when open or close.
        // if like this then attach listener to zoom event

        // Normalize sparkflow and get linewidth and color
        if (sparkflow) {
            let normalized_sparkflow = normalize_sparkflow(sparkflow) // zero to one relative to all edges currently drawn
            let linewidth = utils.interp(normalized_sparkflow, [0,1], [1,zoom_max_linewidth]) // when zoomed out, don't really want more than 3, when zoomed in up to five or so is helpful
            let brightness_factor = utils.interp(normalized_sparkflow, [0, 1], [4,.2]) // darker for more weight
            // let brightness_factor = utils.interp(normalized_sparkflow, [0, 1], [3,.8]) // lighter for when paired w linewidth
            let color = utils.get_edge_color(brightness_factor)
            return [linewidth, color]
            // return [2, color] 
            // most browsers I've looked at don't support this linewidth spec. Keeping one so can develop in way that most ppl will see.
            // but they seem to look wider on other browsers? so putting as two here 
        } else {
            return [1, utils.get_edge_color(1)]
        }
    }

    function updateLineWidthAndColor(line_obj, newLineWidth, newColor) {
        line_obj.material.linewidth = newLineWidth;
        line_obj.material.color = newColor;
        line_obj.material.needsUpdate = true; // Mark the material for update
    }

    // divvy up edges
    // doing this below above so can add in recycled curves
    edges.forEach(e => {
        let n0 = e[0]; let n1 = e[1]; let edge_id = e[2]
        let existing_curve = curves_lookup[edge_id]
        if (existing_curve) {
            existing_edges.push(e)
        } else { 
            // new edges
            if ((n0.originating_position == undefined) && (n1.originating_position != undefined)) {
                // edges going into expanding ops. init at prev location so can tween below via existing_curves pathway
                // there will already be a curve at this exact location (going into module) so it won't look abrubt
                let p = n1.originating_position
                let prev_n1 = {x:p.x, y:p.z, y_unshifted:p.z} // confusing attrs. mimicing a node bc that's what fn get_edge_pts expects
                let pts = utils.get_edge_pts(n0, prev_n1) 
                let [linewidth, color] = get_linewidth_and_color(n0,n1) 
                let line_obj = utils.get_line_from_pts(pts, linewidth, color)
    
                line_obj.userData.pts = pts
    
                curves_lookup[edge_id] = {}
                curves_lookup[edge_id].edge_package = [line_obj, n0.x, n0.y, prev_n1.x, prev_n1.y]
                curves_lookup[edge_id].still_exists = true
                curves_lookup[edge_id].nodes = [n0, n1]
    
                scene.add(line_obj)
                n_recycled_edges += 1

                existing_edges.push(e)

            } else {
                new_edges.push(e)
            }
        }
    })
    
    let n_curves_that_didnt_move = 0; let n_curves_moved = 0; let n_curves_changed_type = 0; let n_new_edges = 0

    // shift existing edges
    existing_edges.forEach(e => {
        let n0 = e[0]; let n1 = e[1]; let edge_id = e[2]
        let [new_line_width, new_line_color] = get_linewidth_and_color(n0, n1)

        let [line_obj, prev_n0_x, prev_n0_y, prev_n1_x, prev_n1_y] = curves_lookup[edge_id].edge_package

        updateLineWidthAndColor(line_obj, new_line_width, new_line_color)

        let curve_didnt_move = ((n0.x==prev_n0_x) && (n0.y==prev_n0_y) && (n1.x==prev_n1_x) && (n1.y==prev_n1_y))
        if (curve_didnt_move) { 
            // curve remained stationary, do nothing
            n_curves_that_didnt_move += 1
        } else { 
            // Curve moved. Shift it to new position
            n_curves_moved += 1

            let newPts = utils.get_edge_pts(n0, n1)
            let oldPts = line_obj.userData.pts
            
            if (newPts.length > oldPts.length) { 
                // Old line was flat and new one is curved. Reinit old line to have more points, then transition those.
                oldPts = utils.get_curve_pts({x:prev_n0_x, y:0, z:prev_n0_y}, {x:prev_n1_x, y:0, z:prev_n1_y}, CURVE_N_PTS)
                line_obj.geometry.setFromPoints(oldPts)
                n_curves_changed_type += 1
            } else if (newPts.length < oldPts.length) {
                // New line is flat and prev was curved. Keep the extra pts, transition them to line. Will have extra pts remaining.
                newPts = utils.get_curve_pts({x:n0.x, y:0, z:n0.y}, {x:n1.x, y:0, z:n1.y}, CURVE_N_PTS)
                n_curves_changed_type += 1
            }

            const oldPositions = oldPts.map(pt => pt.toArray()); const newPositions = newPts.map(pt => pt.toArray());

            all_tweens.push(new TWEEN.Tween(oldPositions)
                .to(newPositions, TWEEN_MS)
                .easing(TWEEN_EASE)
                .onUpdate(updatedPoints => {
                    for (let i = 0; i < oldPts.length; i++) {
                        oldPts[i].set(updatedPoints[i][0], updatedPoints[i][1], updatedPoints[i][2]);
                    }
                    line_obj.geometry.setFromPoints(oldPts);
                }))

                // doesn't seem to strongly affect perf
                line_obj.frustumCulled = false // needed this to prevent from flickering in and out. TODO fix the underlying issue
            
            curves_lookup[edge_id].edge_package = [line_obj, n0.x, n0.y, n1.x, n1.y] // keep position up to date. don't actually need to refresh curve
        }
    })

    // New edges
    new_edges.forEach(e => {
        let n0 = e[0]; let n1 = e[1]; let edge_id = e[2]
        let [linewidth, color] = get_linewidth_and_color(n0,n1)

        n_new_edges += 1
        let pts = utils.get_edge_pts(n0, n1) // the final position
        let line_obj
        if ((n0.originating_position != undefined) && (n1.originating_position != undefined)) {
            // expanding an op, tween lines to final position

            let p = n0.originating_position // will be the same originating position, as they're expanding from collapsed op
            let oldPts = []
            for (let i=0; i<pts.length; i++) {
                oldPts.push(new THREE.Vector3(p.x, p.y, p.z))
            }
            
            line_obj = utils.get_line_from_pts(oldPts, linewidth, color)
            
            const oldPositions = oldPts.map(pt => pt.toArray()); const newPositions = pts.map(pt => pt.toArray());

            all_tweens.push(new TWEEN.Tween(oldPositions)
                .to(newPositions, TWEEN_MS)
                .easing(TWEEN_EASE)
                .onUpdate(updatedPoints => {
                    for (let i = 0; i < oldPts.length; i++) {
                        oldPts[i].set(updatedPoints[i][0], updatedPoints[i][1], updatedPoints[i][2]);
                    }
                    line_obj.geometry.setFromPoints(oldPts);
                }))

            line_obj.frustumCulled = false // needed this to prevent from flickering in and out. TODO fix the underlying issue
            
        } else { 
            // first make, no tween. Just init at final position
            line_obj = utils.get_line_from_pts(pts, linewidth, color)
        }

        line_obj.userData.pts = pts // cache for later tweens

        curves_lookup[edge_id] = {}
        curves_lookup[edge_id].edge_package = [line_obj, n0.x, n0.y, n1.x, n1.y]
        curves_lookup[edge_id].still_exists = true
        curves_lookup[edge_id].nodes = [n0, n1]

        scene.add(line_obj)

    })

    // Update positions of existing curves that have moved
    console.log(`${n_new_edges} new edges created, ${to_remove_edges.length} edges removed, ${n_curves_that_didnt_move} lines didn't move, ${n_curves_moved} moved, ${n_curves_changed_type} changed type`)    
    console.log(`${n_collapsing_edges} edges collapsed, ${n_just_removed_edges} just removed directly`)
    console.timeEnd("draw edges, actually draw them")

    // start all tweens at the same time for synchronicity
    all_tweens.forEach(t => t.start())
}