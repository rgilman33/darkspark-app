
import { globals } from "./utils"
import * as utils from './utils'

///////////////////////////////
// Layout engine
///////////////////////////////

export default function recompute_layout() {
    console.time("compute layout")

    let nn = globals.nn
    
    ///////////////////////////////////////////
    // cache prev positions
    function cache_prev_position(op) {
        // op.prev_pos = {x:op.x, y:op.y}
        op.prev_pos = {x:op.x, y:op.y_unshifted}

        op.children.forEach(c => cache_prev_position(c))
    }
    cache_prev_position(nn)

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
    let always_show_act_vol_fns = ["conv2d", "conv_transpose2d", "linear", "max_pool2d", "cat", "mean", "interpolate", 
                "avg_pool2d", "adaptive_avg_pool2d", "adaptive_avg_pool1d"] 
    let show_act_vol_if_shape_changes = ["__getitem__", "chunk", "split", "unfold", "stack"]
    function should_draw_act_volume(op){
        if (globals.SHOW_ACTIVATION_VOLUMES && op.is_tensor_node) {
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

                    let MAX_SPATIAL = 5 //3
                    specs.width = Math.min(specs.width, MAX_SPATIAL) // TODO have to indicate overflow here also 
                    specs.height = Math.min(specs.height, MAX_SPATIAL)

                    let MAX_DEPTH = 10
                    let depth_overflow
                    if (specs.depth > MAX_DEPTH) {
                        depth_overflow = specs.depth - MAX_DEPTH
                        specs.depth = MAX_DEPTH
                    } else {
                        depth_overflow = 0
                    }
                    specs.depth_overflow = depth_overflow

                    op.activation_volume_specs = specs
                    op.is_activation_volume = depth_overflow > 0 ? false : true 
                    // unsure of how best to show these, so just not showing them. Long and thin aren't helpful to look at anyways.
                }
            }
        } else { // expanded plane, continue inwards
            op.children.forEach(c=>add_activation_volume(c))
        }
    }
    add_activation_volume(nn)

    function prune_children_activation_volumes(op) {
        if (!op.collapsed) {
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
            // Prune actvols
            for (let rid in rows) {
                let row = rows[rid]
                let row_actvols = row.nodes.filter(n => n.is_activation_volume)
                row_actvols.sort((a,b) => a.x_relative - b.x_relative)
                for (let i = 1; i<row_actvols.length; i++) {
                    let prev_actvol = row_actvols[i-1]
                    let this_actvol = row_actvols[i]
                    let s0 = prev_actvol.activation_volume_specs
                    let s1 = this_actvol.activation_volume_specs
                    let no_dims_change = (s0.width==s1.width) && (s0.height==s1.height) && (s0.depth==s1.depth)
                    let pretty_close = (this_actvol.x_relative_original - prev_actvol.x_relative_original) < 6
                    if (no_dims_change && !prev_actvol.is_global_input && pretty_close) {
                        prev_actvol.is_activation_volume = false
                    }
                }
            }
            // 
            op.children.forEach(c => prune_children_activation_volumes(c))
        }

    }
    prune_children_activation_volumes(nn)
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


        // this is the same as is implemented in the fronted, first a normal pass for standard inputs which cling to the left,
        // then a costlier pass only for freshies, to allow them to not cling to left, to attach branch where required 
        // freshie pass is possible to use for all inputs, but is almost 100x more costly in terms of latency, i believe bc of all the 
        // frequent bringing forward of branches ie looping through all peers, though this hypths is not tested
        op.children.forEach(o => {
            o.x_nudge_traversed = false
            o.x_relative = -1e6
            o.x_relative_fully_marked = false
        })

        let input_ops = op.children.filter(o => o.is_input); input_ops.sort((a,b)=>a.input_priority - b.input_priority)
        
        let input_ops_global = input_ops.filter(o => o.is_global_input)
        let input_ops_standard = input_ops.filter(o => !o.is_global_input)

        function get_act_vol_spans(specs){
            let y_span_half = specs.height*.5 + specs.width*.15
            let x_span = specs.depth + specs.width*.15
            return {x_span, y_span_half}
        }

        ///////////////////
        // old version
        function nudge_forward_dns(op_whose_dns_to_nudge) {
            op_whose_dns_to_nudge.x_nudge_traversed = true

            let dns = utils.get_downstream_peer_nodes(op_whose_dns_to_nudge)
            
            ///////////////////////////
            // if any dns are not same row, false. True only when continuing within a row.
            let is_same_row = true
            dns.forEach(dn => {
                let _is_same_row = (dn.draw_order_row===op_whose_dns_to_nudge.draw_order_row) && (dn.parent_op===op_whose_dns_to_nudge.parent_op)
                is_same_row = _is_same_row && is_same_row

                // if (dn.uns.length>1) is_same_row = false; // if dn has multiple incoming, one of them has to be different row
            })
            // keeping 2 everywhere else. 
            /////////////////////////

            dns.forEach(dn => {

                let x_threshold = op_whose_dns_to_nudge.x_relative + op_whose_dns_to_nudge.w
                if (dn.is_activation_volume) {
                    let actvol_x_span = get_act_vol_spans(dn.activation_volume_specs).x_span
                    x_threshold += Math.round(actvol_x_span) 
                    // occ uses array, so int for ix. Can undo the round when occ is more flexible TODO NOTE NOTE
                }
                if (dn.x_relative <= x_threshold) {
                    dn.x_relative = x_threshold + (is_same_row ? 1 : 2)
                    dn.x_relative_fully_marked = true // needed for below, not when used in isolation
                    dn.history_js.push("JS x nudged forward by "+utils.nice_name(op_whose_dns_to_nudge)+" "+x_threshold+" "+dn.x_relative)
                    nudge_forward_dns(dn)
                } else if (!dn.x_nudge_traversed) { // NOTE densenet was giving bug here, taking forever, not recursed but so many retreading. This prevents from retreading ground unless necessary
                    nudge_forward_dns(dn)
                }
            })
        }
        input_ops_standard.forEach(o => nudge_forward_dns(o))
        ///////////////////

        ///////////////////
        // new version
        // marking forward then when hitting already marked, shifts entire branch up to meet it, clumps to the right
        // see backend for full comments, as this is same as there
        function mark_next_x_pos(op_whose_dns_to_nudge) {
            let dns = utils.get_downstream_peer_nodes(op_whose_dns_to_nudge, op.children)

            ///////////////////////////
            // if any dns are not same row, false. True only when continuing within a row.
            // same as above. could consolidate
            let is_same_row = true
            dns.forEach(dn => {
                let _is_same_row = (dn.draw_order_row===op_whose_dns_to_nudge.draw_order_row) && (dn.parent_op===op_whose_dns_to_nudge.parent_op)
                is_same_row = _is_same_row && is_same_row

                // if (dn.uns.length>1) is_same_row = false; // if dn has multiple incoming, one of them has to be different row
            })
            // let shorter_x_amount = true
            // let important_ops = ["conv2d", "linear", "max_pool2d", "cat", "mean", "interpolate", 
            //      "avg_pool2d", "adaptive_avg_pool2d", "adaptive_avg_pool1d", "matmul", "bmm"]
            // if (important_ops.includes(op_whose_dns_to_nudge.name) || 
            //     important_ops.includes(op_whose_dns_to_nudge.created_by_fn) ||
            //     op_whose_dns_to_nudge.node_type=="module") {
            //     shorter_x_amount = false
            // }
            let x_amount = is_same_row ? 1 : 2
            // doesn't work bc in backend have dist of one
            // if (is_same_row && shorter_x_amount) {
            //     x_amount = .5
            // }
            // keeping 2 everywhere else. 
            /////////////////////////


            dns.forEach(dn => {
                if (dn.x_relative_fully_marked) {
                    let to_shift = dn.x_relative - op_whose_dns_to_nudge.x_relative
                    to_shift -= x_amount
                    to_shift -= op_whose_dns_to_nudge.w
                    if (dn.is_activation_volume){
                        let actvol_x_span = get_act_vol_spans(dn.activation_volume_specs).x_span
                        to_shift -= Math.round(actvol_x_span) 
                    }
                    to_shifts.push(to_shift)
                } else {
                    let x_threshold = op_whose_dns_to_nudge.x_relative + op_whose_dns_to_nudge.w
                    if (dn.is_activation_volume) {
                        let actvol_x_span = get_act_vol_spans(dn.activation_volume_specs).x_span
                        x_threshold += Math.round(actvol_x_span) 
                        // occ uses array, so int for ix. Can undo the round when occ is more flexible TODO NOTE NOTE
                    }
                    if (dn.x_relative <= x_threshold) {
                        dn.x_relative = x_threshold + x_amount
                        nodes_in_this_input_group.push(dn)
                        dn.history_js.push("JS x nudged forward by "+utils.nice_name(op_whose_dns_to_nudge)+" "+x_threshold+" "+dn.x_relative)
                        mark_next_x_pos(dn)
                    } else if (!dn.x_nudge_traversed) { // NOTE densenet was giving bug here, taking forever, not recursed but so many retreading. This prevents from retreading ground unless necessary
                        mark_next_x_pos(dn)
                    }
                }
            })
        }
        let to_shifts, nodes_in_this_input_group
        input_ops_global.forEach(o => {
            to_shifts = []; nodes_in_this_input_group = [o] // to be filled out in mark_next_x_pos
            let P = 1e6 
            // when stranded input global op, eg after pruning sd 1.5 we got this, single op, the gets pushed way far over 
            // then way stretched out. Will need to deal w this better
            o.x_relative = -P
            mark_next_x_pos(o)
            let to_shift = to_shifts.length==0 ? P : Math.min(...to_shifts) // on first pass through module will be no diffs, so align to zero 
            
            nodes_in_this_input_group.forEach(n => n.marked_for_this_round = false)
            nodes_in_this_input_group.forEach(n => {
                if (!n.marked_for_this_round) {
                    n.x_relative += to_shift
                    n.x_relative_fully_marked = true
                    n.marked_for_this_round = true // same node may be pushed in multiple times
                }
            })
        })
        ////////////////////////


        ////
        // shift all to start at zero
        let input_min_x = Math.min(...input_ops.map(o=>o.x_relative))
        op.children.forEach(c => {
            c.x_relative -= input_min_x
        })
        // make sure all standard inputs are on the left. Global inputs remain where they were
        input_ops.forEach(o => {
            if (!o.is_global_input) {
                o.x_relative = 0
            }
        })
        


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
                let branch_dns = branch_node.dn_ids.map(nid => globals.nodes_lookup[nid])
                let min_x = Math.min(...branch_dns.map(o => o.x_relative))
                branch_node.x_relative = min_x - 2
                branch_node.history_js.push("moving extension to stay one less than dn")
            } else { // is pre elbow
                let nid = branch_node.uns[0] // will only be one
                let un = globals.nodes_lookup[nid] 
                branch_node.x_relative = un.x_relative + 2
                branch_node.history_js.push("moving pre-elbow to stay one more than un") 
            }
        }) 
        // TODO do this each time we nudge a node forward. It should bring it's preceding elbow / ext with it
        // so that other nodes can also respond




        ////////////////////////////////////////////////
        // Relative y

        // NOTE ensure these all use ints, for occ grid

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

            // no, can't do back to uns and down to dns bc then get double counting, overlap eg in sd 1.4 midblock. We've been doing
            // trace to dn for awhile and i'm good w that, don't use this trace back to un then.
            let uns = utils.get_upstream_peer_nodes(first_op) // all the way from dispatching node, relevent in eg stylegan when it is input
            if (false){ //(uns.length==1 && uns[0].node_type=="input") { 
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
            let dns = utils.get_downstream_peer_nodes(last_op) // all the way till terminating node, ie not just row itself
            let dn_max_x = Math.max(...dns.map(dn => dn.x_relative))
            last_op.is_last_in_row = true

            let until = last_op.x_relative + last_op.w
            row.ends_at_x = Math.max(until, dn_max_x-2) //NOTE this 2 

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

            // 
            let actvol_nodes = row.nodes.filter(n => n.is_activation_volume)
            let row_actvol_hheights = actvol_nodes.map(n => n.activation_volume_specs.height*.6)
            if (row_actvol_hheights.length>0){
                row.actvol_hheight = Math.max(...row_actvol_hheights)
            } else {
                row.actvol_hheight = 0
            }
            row.nodes.forEach(n=>n.row_actvol_hheight=row.actvol_hheight)

            //
            let important_ops = ["conv2d", "linear", "max_pool2d", "cat", "mean", "interpolate", 
                        "avg_pool2d", "adaptive_avg_pool2d", "adaptive_avg_pool1d", "matmul", "bmm"]
            let is_primary_row = false
            row.nodes.forEach(n => {
                if (n.n_params >0 || n.is_activation_volume || (important_ops.includes(n.name)) ||
                    (n.is_respath_row) // this should be if is respath row, some models have multiple    
                ) {
                    is_primary_row = true
                    return
                }
            })

            let base_pad = is_primary_row ? 1. : .2
            row.pad = base_pad //Math.max(row.actvol_hheight, base_pad)

            

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

            block_occupancy(row.starts_at_x, row.ends_at_x, row.y_relative+row.pad)
            let ACTVOL_HHEIGHT_MODIFIER = .7

            // Block occ for all expanded ops in the row
            row.nodes.forEach(o => {
                if (!o.collapsed) { // expanded box within the row
                    let top = o.y_relative + o.h + 1. //.5 //.6 NOTE NOTE this hardcoding
                    let right = o.x_relative + o.w
                    block_occupancy(o.x_relative, right, top)
                } else if (o.is_activation_volume) {
                    let actvol_spans = get_act_vol_spans(o.activation_volume_specs)
                    block_occupancy(Math.floor(o.x_relative-actvol_spans.x_span), o.x_relative, actvol_spans.y_span_half)
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
                        let uns = utils.get_upstream_nodes_from_group(input_node, op.children) // the upstream op back in the current peer op group
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
            // similar to above, but if is collapsed. Now w variable row heights these benefit in same way as do expanded boxes.
            // it's nice for things to align. Can also do for outgoing. Should consolidate this functionality as it's all very similar
            let first_node_in_row = row.nodes[0]
            // if (first_node_in_row.node_type==="module") { // can also do for non-modules
            if (true) { // can also do for non-modules
                let uns = utils.get_upstream_nodes_from_group(first_node_in_row, op.children)
                uns.forEach(un => {
                    if (un.is_last_in_row) {
                        let id_of_incoming_row = un.draw_order_row
                        let incoming_row = rows[id_of_incoming_row]
        
                        if (incoming_row.y_relative < first_node_in_row.y_relative) { 
                            if (queue_row_ids.includes(id_of_incoming_row)) { // if the incoming row is not yet fixed
                                // if the incoming row is below the target height of the input node of the expanded box
                                set_row_y(incoming_row, first_node_in_row.y_relative)
                                incoming_row.has_been_moved_up_w_expanding_box = true
                            }
                        } 
                    }
                })
            }
            

            row.nodes.forEach(o => { // TODO if we like this, refactor into one fn, only diff is get_uns and .is_output. otherwise identical to above
                if (!o.collapsed) { // expanded box within the row. bring its input nodes up to its frame of reference
                    let c_sub_inputs = o.children.filter(cc => cc.is_output)
                    c_sub_inputs.forEach(cc => { // y_relative_grandparent is the subops y_relative value in the current frame of reference
                        cc.x_relative_grandparent = o.x_relative + cc.x_relative
                        cc.y_relative_grandparent = o.y_relative + cc.y_relative
                    })
                    c_sub_inputs.sort((a,b) => a.y_relative_grandparent - b.y_relative_grandparent) 
                    c_sub_inputs.forEach(input_node => {
                        let uns = utils.get_downstream_nodes_from_group(input_node, op.children) // the upstream op back in the current peer op group
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
                // if (row.nodes[0].parent_op.name=="UNetMidBlock2DCrossAttn"){
                //     console.log("row", row)
                // }
                let occ = Math.max(...occupancy.slice(row.starts_at_x, row.ends_at_x+1))
                let new_row_y =  occ+row.pad
                
                let actvols = row.nodes.filter(n=>n.is_activation_volume)
                actvols.forEach(o => {

                    let actvol_spans = get_act_vol_spans(o.activation_volume_specs)
                    let s = Math.floor(o.x_relative-actvol_spans.x_span)

                    let actvol_occ = Math.max(...occupancy.slice(s, o.x_relative+1))
                    
                    new_row_y = Math.max(new_row_y, actvol_occ+actvol_spans.y_span_half)
                })

                if (row.has_been_moved_up_w_expanding_box && row.y_relative>new_row_y) { 
                    // if moved up w expanding box and is higher than new value, let it stay. 
                } else {
                    set_row_y(row, new_row_y)
                }
            })
    
        }

        ///////////////////////////
        if (!globals.DEBUG) {
            let input_nodes_can_be_removed = true
            op.children.forEach(o => {
                if (o.is_output) { 
                    
                    let uns = utils.get_upstream_peer_nodes(o)
                    if ((uns.length==1) && 
                            ["fn_out", "mod_out"].includes(uns[0].node_type) && // can't be is_tensor_node bc don't want to move elbows back. could maybe be just fn_node
                            !uns[0].is_activation_volume && 
                            !(uns[0].tensor_node_type=="act_vol")) {
                        // awkward. if not actvol or WAS actvol prev. If was prev actvol. I think instead we should refactor and identify extraneous
                        // io first, then not make it an actvol if extraneous io. This current way results in sometimes having two tensor nodes
                        // back to back, which we don't normally have, and may confuse me later on. 
                        // NOTE extraneous_io means it's fn_output and it stacks up w others eg mod_out to not need to be shown, otherwise we'd
                        // have fn_out followed by mod_out, both the same tensor, even through we've removed the output node

                        o.x_relative -= 2 //1.8 //.9

                        uns[0].x_relative -= 1 //.9
                        uns[0].node_is_extraneous_io = true
                    } else {
                        o.x_relative -= 1 //1.8 //.9
                    }
                } 
                else if (o.is_input) {

                    let dns = utils.get_downstream_peer_nodes(o) 

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

        // // // ////////////////////////////
        // // NOTE this is not correct, as this is doing it within each module, but our correction in draw_nn is absolute coords
        // // we need to simplify our elbows, make them all explicit, then can calc the slope easing once here and everything else
        // // will be good
        // // Ease the slope 
        // // this clears the space, but in draw edges need to use it
        // op.children.forEach(o => o.x_nudge_traversed = false)
        // function _nudge_forward_dns(op_whose_dns_to_nudge) {
        //     op_whose_dns_to_nudge.x_nudge_traversed = true

        //     let dns = utils.get_downstream_peer_nodes(op_whose_dns_to_nudge)
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
        op.y += Math.random()*.001 // WTF this affects display, like need this or sometimes line doesn't display? happened after Line2. Only happens in some cases, after tweens
        // if (globals.DEBUG) { op.y += Math.random()*.2 }
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

    //////////////////////////////////
    // set should_draw. Used to hide nodes used for structural layout, eg elbows, inputs, etc, but to show them 
    // when eg debug
    for (let op_id in globals.nodes_lookup) {
        let op = globals.nodes_lookup[op_id]
        if (((op.node_type=="function" || 
            op.node_type=="module" || 
            op.is_global_input || 
            op.node_type=="fn_out" || 
            op.node_type=="mod_out") &&
            !op.node_is_extraneous_io) || globals.DEBUG || op.is_activation_volume
            ) {
                op.should_draw = true
        } else {
            op.should_draw = false
        }
    }

    //////////////////////////////
    // visible max depth
    globals.max_depth_visible = 0
    function set_visible_max_depth(op) {
      globals.max_depth_visible = Math.max(globals.max_depth_visible, (op.depth ? op.depth : 0))
        if (!op.collapsed){
            op.children.forEach(c => set_visible_max_depth(c))
        }
    }
    set_visible_max_depth(nn)
    console.log("max depth visible", globals.max_depth_visible)

    //////////////////////////////
    // visible max depth
    let n_params = []
    function set_visible_max_n_params(op) {
        if (op.collapsed) {
            if (op.n_params != undefined) {
                n_params.push(op.n_params)
            }
        } else {
            op.children.forEach(c => set_visible_max_n_params(c))
        }
    }
    set_visible_max_n_params(nn)

    n_params.sort((a,b)=>a-b)
    let n_params_at_upper_percentile = n_params[parseInt(n_params.length*.95)]
    globals.max_n_params_visible = n_params_at_upper_percentile //Math.max(...n_params)

    console.log("max n_params value visible", globals.max_n_params_visible) 
    // not actually max, capping at 95th percentile so very large outliers don't destroy scale
    // TODO need to ensure scales are now always updating during all transitions

    console.timeEnd("compute layout")
}
