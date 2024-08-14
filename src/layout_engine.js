
import { globals } from "./utils"
import { DEBUG } from "./utils"
import * as utils from './utils'

///////////////////////////////
// Layout engine
///////////////////////////////

export default function recompute_layout() {
    console.time("compute layout")

    let nn = globals.nn
    

    ///////////////////////////////////////////////
    ///////////////////////////////////////////////
    // activation volumes
    function get_act_volume_specs(op) {
        let specs = {
            'features':[],
            'spatial':[]
        }
        if ("dim_types" in op) {
            op.dim_types.forEach((d,i)=>{
                let s = op.shape[i]
                if (d in specs) {
                    specs[d].push(s)
                }
            })
        }

        if (specs.features.length==1 && specs.spatial.length==2) { // normal standard volume
            return specs
        } else if (specs.spatial.length==2 && specs.features.length==0) { // one channel is implied, add it in, eg depth output
            specs.features.push(1)
            return specs
        } else if (specs.spatial.length==0 && specs.features.length==1) { // single feature vector, add ones for spatial to show
            return undefined // don't like how they look. too long and thin, take up too much space
            // specs.spatial.push(1)
            // specs.spatial.push(1)
            // return specs
        } else if (specs.spatial.length==1 && specs.features.length==1) { // sequence, eg text, pad width w one and sequence shown vertically
            specs.spatial.push(1)
            return undefined // specs // can put back in when we're expanding y height variable, otherwise overlap makes hard to read
        } else {
            return undefined
        }
    }
    let always_show_act_vol_fns = ["conv2d", "linear", "max_pool2d", "cat", "mean", "interpolate", 
                "avg_pool2d", "adaptive_avg_pool2d", "adaptive_avg_pool1d"] 
    let show_act_vol_if_shape_changes = ["__getitem__", "chunk", "split", "unfold", "stack"]
    function should_draw_act_volume(op){
        if (op.is_tensor_node) {
            if (op.is_global_input || op.is_output_global) {
                return true
            } else if (op.node_type=="mod_out"){
                let dispatching_module_is_collapsed = globals.nodes_lookup[op.from_module_nid].collapsed
                return dispatching_module_is_collapsed // don't show when mod is expanded
                // if use this, then will have to change actual node mesh bc it started as small square and is now a volume
            } else if (op.node_type=="fn_out"){
                if (always_show_act_vol_fns.includes(op.created_by_fn)) {
                    return true
                } else if (show_act_vol_if_shape_changes.includes(op.created_by_fn)) {
                    return true // TODO only return if shape changes. Will need to get actvol specs first
                }
            }
        }
        return false
    }
    function add_activation_volume(op) {
        op.is_activation_volume = false // default false
        if (op.collapsed) { // node
            if (should_draw_act_volume(op)) { // candidate for drawing
                let specs = get_act_volume_specs(op)
                if (specs!=undefined) { // only draw if we have sufficient dim type info
                
                    let channels_scalar = .01
                    let spatial_scalar = channels_scalar * 1
                    specs.height = specs.spatial[0] * spatial_scalar
                    specs.width = specs.spatial[1] * spatial_scalar
                    specs.depth = specs.features[0] * channels_scalar

                    let MIN_SPATIAL = .04
                    specs.width += MIN_SPATIAL
                    specs.height += MIN_SPATIAL

                    let MAX_SPATIAL = 3
                    specs.width = Math.min(specs.width, MAX_SPATIAL) // TODO have to indicate overflow here also 
                    specs.height = Math.min(specs.height, MAX_SPATIAL)

                    let MAX_DEPTH = 8
                    let depth_overflow
                    if (specs.depth > MAX_DEPTH) {
                        depth_overflow = specs.depth - MAX_DEPTH
                        specs.depth = MAX_DEPTH
                    } else {
                        depth_overflow = 0
                    }
                    specs.depth_overflow = depth_overflow

                    op.activation_volume_specs = specs
                    op.is_activation_volume = true
                }
            }
        } else { // expanded plane, continue inwards
            op.children.forEach(c=>add_activation_volume(c))
        }
    }
    add_activation_volume(nn)
    ///////////////////////////////////////////////////

    
    function reset_dims(op) {
        op.x_relative = op.x_relative_original
        op.y_relative = op.y_relative_original
        op.history_js = []
        op.children.forEach(c => reset_dims(c))
    }
    reset_dims(nn)


    // Updating relative xy coords bc of expansions
    // just consider two levels at a time: an op and its children ops
    // the children ops x_relative and y_relative are defined in terms of their parent op's
    // frame of reference, but their h and w dims are actual values

    function update_op_h_w(op) {

        if (op.collapsed || op.children.length==0) {
            op.h = 0; op.w = 0
            return
        }

        op.children.forEach(c => update_op_h_w(c))
        // now each child has h w as a result of the expansion and arrangement of its children. 
        // Imagine all the boxes expanded, but not yet shifted around, so there is overlap. We now 
        // have to shift the boxes around to eliminate overlap. 
        // Relative coords haven't been updated based on the h w and expansions of the peer subops. 
        // That's what we're doing below.
        
        // relative X 
        let input_ops = op.children.filter(o => o.is_input); input_ops.sort((a,b)=>a.input_priority - b.input_priority)
        op.children.forEach(o => o.x_nudge_traversed = false)
        function nudge_forward_dns(op_whose_dns_to_nudge) {
            op_whose_dns_to_nudge.x_nudge_traversed = true

            let dns = utils.get_downstream_nodes(op_whose_dns_to_nudge, op.children)
            dns.forEach(dn => {
                let x_threshold = op_whose_dns_to_nudge.x_relative + op_whose_dns_to_nudge.w
                if (dn.is_activation_volume) {
                    x_threshold += Math.round(dn.activation_volume_specs.depth) 
                    // occ uses array, so int for ix. Can undo the round when occ is more flexible TODO NOTE NOTE
                }
                if (dn.x_relative <= x_threshold) {
                    dn.x_relative = x_threshold + 1
                    dn.history_js.push("JS x nudged forward by "+utils.nice_name(op_whose_dns_to_nudge)+" "+x_threshold+" "+dn.x_relative)
                    nudge_forward_dns(dn)
                } else if (!dn.x_nudge_traversed) { // NOTE densenet was giving bug here, taking forever, not recursed but so many retreading. This prevents from retreading ground unless necessary
                    nudge_forward_dns(dn)
                }
            })
        }
        input_ops.forEach(o => nudge_forward_dns(o))
        
        // Moving all output nodes to the right edge of expanded box
        // but only if they're not a module, ie if they're one of the single output ops we created ourselves
        let max_x = Math.max(...op.children.map(o => o.x_relative))
        let output_nodes = op.children.filter(o => o.is_output)
        output_nodes = output_nodes.filter(o => o.node_type=="output") // ie not modules. ie the nodes we created manually.
        output_nodes.forEach(o => o.x_relative = max_x)

        //////
        // Keep extension / branch nodes one behind their target downstream node, as that is their purpose
        op.children.filter(o=>["extension", "elbow"].includes(o.node_type)).forEach(branch_node => {
            if (!branch_node.pre_elbow) {
                let branch_dns = branch_node.dn_ids.map(nid => utils.get_node(nid, op.children))
                let min_x = Math.min(...branch_dns.map(o => o.x_relative))
                branch_node.x_relative = min_x - 1
                branch_node.history_js.push("moving extension to stay one less than dn")
            } else { // is pre elbow
                let un = utils.get_node(branch_node.uns[0], op.children) // will only be one
                branch_node.x_relative = un.x_relative + 1
                branch_node.history_js.push("moving pre-elbow to stay one more than un") 
            }
        }) 
        // TODO do this each time we nudge a node forward. It should bring it's preceding elbow / ext with it
        // so that other nodes can also respond


        ////////////////////////////////////////////////
        // Relative y

        // NOTE TODO ensure these all use ints, for occ grid

        // compile rows lookup
        let rows = {}
        op.children.forEach(c => {
            if (!(c.draw_order_row in rows)) {
                rows[c.draw_order_row] = {
                    "nodes":[],
                    "draw_order_row":c.draw_order_row,
                }
            };
            rows[c.draw_order_row].nodes.push(c)
        })
        // calc information for each row
        for (let rid in rows) {
            let row = rows[rid]
            row.nodes.sort((a,b) => a.x_relative - b.x_relative)
            let first_op = row.nodes[0]

            let uns = utils.get_upstream_nodes(first_op, op.children) // all the way from dispatching node, relevent in eg stylegan when it is input
            if (uns.length==1 && uns[0].node_type=="input") { 
                // Total hack for now. Only affects stylegan as far as i know. TODO NOTE NOTE don't know if this affects non inputs. See notes below
                // let un_max_x = Math.max(...uns.map(un => un.x_relative)) // when will there be multiple? should this be min? NOTE NOTE pay attn
                // console.log(un_max_x, first_op.x_relative)
                uns.sort((a,b) => a.x_relative - b.x_relative) // when will there be multiple? should this be min? NOTE NOTE pay attn
                let max_un = uns[uns.length-1]
                row.starts_at_x = max_un.x_relative + max_un.w + 1 // one after the right edge of un, width is zero when collapsed
            } else {
                row.starts_at_x = first_op.x_relative
            }
            // row.starts_at_x = un_max_x + 1
            // // dunno about this. Doing it for case of stylegan where dispatching node is input, doesn't have fn out etc to move upwards
            // // so row was starting way far down, at the elbow, but want it to start earlier bc of occupancy
            // This is not quite right, bc we're also extending forward, so get double counting when extend both. Coat mini has this, leading
            // to extraneous up shift. Restricting to only un==input for now to affect only stylegan
            // will the move the elbows in JS fix this? we need each row to always start right after the dispatching node and end 
            // right before the terminating node. 

            // row.starts_at_x = first_op.x_relative


            let last_op = row.nodes[row.nodes.length-1]
            let dns = utils.get_downstream_nodes(last_op, op.children) // all the way till terminating node, ie not just row itself
            let dn_max_x = Math.max(...dns.map(dn => dn.x_relative))

            let until = last_op.x_relative + last_op.w
            row.ends_at_x = Math.max(until, dn_max_x-1) 

            row.y_relative = 0 //row.nodes[0].y_relative // all have same y_relative

            // 
            row.is_only_tensors = true
            row.nodes.forEach(n => {
                if (["function", "module"].includes(n.node_type)) { // can remove the elbow, ext check bc next run making those tensors
                    row.is_only_tensors = false
                }
                n.n_peer_row_nodes = row.nodes.length
            })
            row.nodes.forEach(n=>n.row=row)
            

        }
        // Set y_relative for row and all nodes in row. should only increment up
        function set_row_y(row, new_y_value) {
            row.nodes.forEach(o => o.y_relative = new_y_value)
            row.y_relative = new_y_value
        }

        ////////
        let row_queue = [] // not actually using this as a queue, ie not ever adding back to the end, just cycling through
        Object.keys(rows).forEach(rid => row_queue.push(rows[rid])) // rows dict in list form
        row_queue.sort((a,b)=>{
            return a.draw_order_row - b.draw_order_row
        })

        let occupancy = new Array(3000).fill(-1)
        function block_occupancy(from, until, value) { // NOTE must be int
            for (let i=from; i<=until; i++) { // includes 'until'. May be float bc eg act vol
                occupancy[i] = Math.max(occupancy[i], value) // why can't just block at y directly, when will this come in below?
            }
        }

        while (row_queue.length > 0) {
            
            // moving other rows up in response to this row
            // this row's y_relative has already been set
            let row = row_queue.shift() // take at ix 0 and shift rest one to the left
            
            //////////////////
            // block occupancy for row line
            let above_pad = .8 //.5 //row.is_only_tensors ? .2 : .6 //1 // TODO move row padding to row creation
            // this works when have expansions, but if nodes are starting out already higher than the expansion, we're not 
            // catching it. Can change to not expand in Python, or adjust our row setting below to also allow them to go down
            // if overlap is negative

            block_occupancy(row.starts_at_x, row.ends_at_x, row.y_relative+above_pad)

            // Block occ for all expanded ops in the row
            row.nodes.forEach(o => {
                if (!o.collapsed) { // expanded box within the row
                    let top = o.y_relative + o.h + .8 //.5 //.6
                    let right = o.x_relative + o.w
                    block_occupancy(o.x_relative, right, top)
                }
            })

            ///////////////////
            // Shifting input rows up
            let queue_row_ids = row_queue.map(r => r.draw_order_row)

            row.nodes.forEach(o => {
                if (!o.collapsed) { // expanded box within the row. bring its input nodes up to its frame of reference
                    let c_sub_inputs = o.children.filter(cc => cc.is_input)
                    c_sub_inputs.forEach(cc => { // y_relative_grandparent is the subops y_relative value in the current frame of reference
                        cc.x_relative_grandparent = o.x_relative + cc.x_relative
                        cc.y_relative_grandparent = o.y_relative + cc.y_relative
                    })
                    c_sub_inputs.sort((a,b) => a.y_relative_grandparent - b.y_relative_grandparent) 
                    c_sub_inputs.forEach(input_node => {
                        let uns = utils.get_upstream_nodes(input_node, op.children) // the upstream op back in the current peer op group
                        if (uns.length==1) {

                            let id_of_incoming_row = uns[0].draw_order_row
                            let incoming_row = rows[id_of_incoming_row]

                            if (incoming_row.y_relative < input_node.y_relative_grandparent) { 
                                if (queue_row_ids.includes(id_of_incoming_row)) { // if the incoming row is not yet fixed
                                    // if the incoming row is below the target height of the input node of the expanded box
                                    set_row_y(incoming_row, input_node.y_relative_grandparent)
                                    incoming_row.has_been_moved_up_w_expanding_box = true
                                }
                            }
                        }
                    })
                }
            })
            row.nodes.forEach(o => { // TODO if we like this, refactor into one fn, only diff is get_uns and .is_output
                if (!o.collapsed) { // expanded box within the row. bring its input nodes up to its frame of reference
                    let c_sub_inputs = o.children.filter(cc => cc.is_output)
                    c_sub_inputs.forEach(cc => { // y_relative_grandparent is the subops y_relative value in the current frame of reference
                        cc.x_relative_grandparent = o.x_relative + cc.x_relative
                        cc.y_relative_grandparent = o.y_relative + cc.y_relative
                    })
                    c_sub_inputs.sort((a,b) => a.y_relative_grandparent - b.y_relative_grandparent) 
                    c_sub_inputs.forEach(input_node => {
                        let uns = utils.get_downstream_nodes(input_node, op.children) // the upstream op back in the current peer op group
                        if (uns.length==1) {

                            let id_of_incoming_row = uns[0].draw_order_row
                            let incoming_row = rows[id_of_incoming_row]

                            if (incoming_row.y_relative < input_node.y_relative_grandparent) { 
                                if (queue_row_ids.includes(id_of_incoming_row)) { // if the incoming row is not yet fixed
                                    // if the incoming row is below the target height of the input node of the expanded box
                                    set_row_y(incoming_row, input_node.y_relative_grandparent)
                                    incoming_row.has_been_moved_up_w_expanding_box = true
                                }
                            }
                        }
                    })
                }
            })

            // move remaining rows up to evade occupancy
            row_queue.forEach(row => {
                let below_pad = .8 //.5 //row.is_only_tensors ? .2 : .6
                let occ = Math.max(...occupancy.slice(row.starts_at_x, row.ends_at_x+1))
                let new_row_y =  occ+below_pad

                if (row.has_been_moved_up_w_expanding_box && row.y_relative>new_row_y) { 
                    // if moved up w expanding box and is higher than new value, let it stay. 
                } else {
                    set_row_y(row, new_row_y)
                }
            })
    
        }

        ///////////////////////////
        if (!DEBUG) {
            let input_nodes_can_be_removed = true
            op.children.forEach(o => {
                if (o.is_output) { 
                    
                    let uns = utils.get_upstream_nodes(o, op.children)
                    if ((uns.length==1) && uns[0].is_tensor_node && !uns[0].is_activation_volume) {
    
                        o.x_relative -= 2 //1.8 //.9

                        uns[0].x_relative -= 1 //.9
                        uns[0].node_is_extraneous_io = true
                    } else {
                        o.x_relative -= 1 //1.8 //.9
                    }
                } 
                else if (o.is_input) {

                    let dns = utils.get_downstream_nodes(o, op.children) 

                    if (dns.length>1 || o.is_global_input) {
                        input_nodes_can_be_removed = false
                    } else if (dns.length == 1) {
                        if (dns[0].y_relative != o.y_relative) {
                            input_nodes_can_be_removed = false
                        }
                    }
                }
            })

            if (input_nodes_can_be_removed) {
                op.children.forEach(o => {
                    if (!o.is_input) {
                        o.x_relative -= 1 //.9
                    }
                })
            }
        }

        // ////////////////////////////
        // NOTE this is not correct, as this is doing it within each module, but our correction in draw_nn is absolute coords
        // we need to simplify our elbows, make them all explicit, then can calc the slope easing once here and everything else
        // will be good
        // // Ease the slope 
        // // this clears the space, but in draw edges need to use it
        // op.children.forEach(o => o.x_nudge_traversed = false)
        // function _nudge_forward_dns(op_whose_dns_to_nudge) {
        //     op_whose_dns_to_nudge.x_nudge_traversed = true

        //     let dns = utils.get_downstream_nodes(op_whose_dns_to_nudge, op.children)
        //     dns.forEach(dn => {
        //         let min_x_dist = Math.round(Math.abs(dn.y_relative - op_whose_dns_to_nudge.y_relative) / 2)
        //         let x_threshold = op_whose_dns_to_nudge.x_relative + min_x_dist
        //         if (dn.x_relative < x_threshold) {
        //             let diff = x_threshold - dn.x_relative
        //             let all_after_this_x = op.children.filter(o => o.x_relative>=dn.x_relative)// includes this dn
        //             all_after_this_x.forEach(o => {
        //                 o.x_relative += diff
        //             })
        //             _nudge_forward_dns(dn)
        //         } else if (!dn.x_nudge_traversed) { // NOTE densenet was giving bug here, taking forever, not recursed but so many retreading. This prevents from retreading ground unless necessary
        //             _nudge_forward_dns(dn)
        //         }
        //     })
        // }
        // input_ops.forEach(o => _nudge_forward_dns(o))
        // /////////////////////////////////


        // Now that all children ops have their dims, and have been shifted bc of expansions, we can ascertain
        // the dimensions of the parent op
        op.w = Math.max(...op.children.map(c => c.x_relative+c.w))
        op.h = Math.max(...op.children.map(c => c.y_relative+c.h))
    }
    update_op_h_w(nn)

    // Get absolute coords from nested relative coords
    function set_op_children_absolute_coords(op) {
        op.children.forEach(c => {
            c.x = op.x + c.x_relative
            c.y = op.y + c.y_relative
            set_op_children_absolute_coords(c)
        })
    }
    nn.x = 0; nn.y = 0
    set_op_children_absolute_coords(nn)

    // debugging
    function random_shift(op) {
        op.y_unshifted = op.y
        if (DEBUG) { op.y += Math.random()*.2 }
        op.children.forEach(c => random_shift(c))
    }
    random_shift(nn)

    // Mark plane specs
    // let PLANE_BUFFER = {top:.05, bottom:.15, left:.05, right:.05}
    let PLANE_BUFFER = {top:.1, bottom:.15, left:.1, right:.1}
    function mark_plane_specs(op) {
        op.children.forEach(c => {
            if (c.collapsed){
                c.plane_info = {}
                c.plane_info.min_x = c.x - PLANE_BUFFER.left
                c.plane_info.max_x = c.x + PLANE_BUFFER.right
                c.plane_info.min_y = c.y - PLANE_BUFFER.top
                c.plane_info.max_y = c.y + PLANE_BUFFER.bottom
            } else {
                mark_plane_specs(c)
            }
        })
        op.plane_info = {}
        // x
        let children_min_xs = op.children.map(c => c.plane_info.min_x)
        op.plane_info.min_x = Math.min(...children_min_xs) - PLANE_BUFFER.left

        let children_max_xs = op.children.map(c => c.plane_info.max_x)
        op.plane_info.max_x = Math.max(...children_max_xs) + PLANE_BUFFER.right

        // y
        let children_min_ys = op.children.map(c => c.plane_info.min_y)
        op.plane_info.min_y = Math.min(...children_min_ys) - PLANE_BUFFER.top

        let children_max_ys = op.children.map(c => c.plane_info.max_y)
        op.plane_info.max_y = Math.max(...children_max_ys) + PLANE_BUFFER.bottom

    }
    mark_plane_specs(nn)
    console.log(nn)
    console.timeEnd("compute layout")
}
