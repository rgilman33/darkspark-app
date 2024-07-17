
import { globals } from "./utils"
import { DEBUG } from "./utils"
import * as utils from './utils'

///////////////////////////////
// Layout engine
///////////////////////////////

export default function recompute_layout() {
    console.time("compute layout")

    let nn = globals.nn
    
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
            let x_threshold = op_whose_dns_to_nudge.x_relative + op_whose_dns_to_nudge.w
            dns.forEach(dn => {
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
        function get_node(nid, ns) {
            return ns.filter(n => n.node_id==nid)[0]
        }
        op.children.filter(o=>["extension", "elbow"].includes(o.node_type)).forEach(branch_node => {
            if (!branch_node.pre_elbow) {
                let branch_dns = branch_node.dn_ids.map(nid => get_node(nid, op.children))
                let min_x = Math.min(...branch_dns.map(o => o.x_relative))
                branch_node.x_relative = min_x - 1
                branch_node.history_js.push("moving extension to stay one less than dn")
            } else { // is pre elbow
                let un = get_node(branch_node.uns[0], op.children) // will only be one
                branch_node.x_relative = un.x_relative + 1
                branch_node.history_js.push("moving pre-elbow to stay one more than un") 
            }
        })


        ////////////////////////////////////////////////
        // Relative y

        // important that these always go in proper order

        op.children.sort((a,b)=>{
            return a.draw_order - b.draw_order
        })
        let occupancy = new Array(3000).fill(-1)
        let occupancy_ids = new Array(3000).fill("none") // for debugging only

        let queue = []
        op.children.forEach(c => queue.push(c))
        let counter = 0
        while (queue.length > 0) {
            
            // moving other ops up in response to this op
            let c = queue.shift() // take at ix 0
            
            // update occupancy w child box
            let c_top = c.y_relative + c.h

            let block_until = c.x_relative+c.w

            if (c.is_last_in_line) { // normal elbow
                let terminates_at = op.children.filter(o => o.node_id==c.terminates_at)[0]
                let end_of_flat_line = terminates_at.x_relative - 1
                block_until = Math.max(block_until, end_of_flat_line)
            }

            for (let i=c.x_relative; i<=block_until; i++) {
                if (c_top > occupancy[i]) {
                    occupancy[i] = Math.max(occupancy[i], c_top)
                    occupancy_ids[i] = "child box " + utils.nice_name(c)
                }
            }


            let rows_to_shift_with_inputs = {}
			if (!c.collapsed) { // child c is expanded, bring its input nodes up to its frame of reference
				let c_sub_inputs = c.children.filter(cc => cc.is_input)
				c_sub_inputs.forEach(cc => {  
					// c_input in the frame of reference of grandparent op, rather than parent c
					// ie now the children of c are also in c's frame of reference
					cc.x_relative_grandparent = c.x_relative + cc.x_relative
					cc.y_relative_grandparent = c.y_relative + cc.y_relative
				})
				c_sub_inputs.sort((a,b) => a.y_relative_grandparent - b.y_relative_grandparent) 
                c_sub_inputs.forEach(input_node => {
                    // let un = get_upstream_nodes(input_node, op.children) // the upstream op back in the current peer op group
                    let un = utils.get_upstream_nodes(input_node, queue) // the upstream op back in the current peer op group
                    if (un.length==1) {
                        rows_to_shift_with_inputs[un[0].row_counter] = input_node.y_relative_grandparent
                    }
                })
                for (let rid in rows_to_shift_with_inputs) {
                    let input_y_relative = rows_to_shift_with_inputs[rid]
                    // let ops_in_row = op.children.filter(o => o.row_counter==rid)
                    let ops_in_row = queue.filter(o => o.row_counter==rid)
                    if (ops_in_row.length>0) {
                        if (ops_in_row[0].y_relative < input_y_relative) {
                            ops_in_row.forEach(o => {
                                o.y_relative = input_y_relative
                            })
                        }
                    }
                }
			}

            // nested by row id
            let rows = {}
            queue.forEach(o => {
                if (!(o.row_counter in rows)) rows[o.row_counter] = [];
                rows[o.row_counter].push(o)
            })

            // TODO these rows can be compiled once for the peer group, not for each child separately

            for (let rid in rows) {
                let r = rows[rid]
                r.sort((a,b) => a.x_relative - b.x_relative)
                let from = r[0].x_relative
                let last_op = r[r.length-1]
                let dns = utils.get_downstream_nodes(last_op, op.children)
                let dn_max_x = Math.max(...dns.map(dn => dn.x_relative))

                let until = last_op.x_relative + last_op.w
                until = Math.max(until, dn_max_x-1)

                let occ = Math.max(...occupancy.slice(from, until+1))
                let row_overlap = occ - r[0].y_relative +1 // all have same y
                if (row_overlap > 0) { 
                    r.forEach(o => o.y_relative += row_overlap)
                }
            }

            counter += 1
            if (counter > 1e4) {
                console.log("too many iters on the y shift stack")
                return
            }
    
        }

        ///////////////////////////
        if (!DEBUG) {
            let input_nodes_can_be_removed = true
            op.children.forEach(o => {
                if (o.is_output) { 
                    
                    o.x_relative -= 1.8 //.9
    
                    let uns = utils.get_upstream_nodes(o, op.children)
                    if (uns.length==1) {
                        if (uns[0].node_type == "fn_out" || uns[0].node_type == "mod_out" || uns[0].node_type == "elbow") {
                            uns[0].x_relative -= .9
                            uns[0].node_is_extraneous_io = true
                        }
                    }
                } else if (o.is_input) {

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
                        o.x_relative -= .9
                    }
                })
            }
        }

        // ////////////////////////////
        // // Ease the slope
        // // this clears the space, but in draw edges need to use it
        // op.children.forEach(o => o.x_nudge_traversed = false)
        // function _nudge_forward_dns(op_whose_dns_to_nudge) {
        //     op_whose_dns_to_nudge.x_nudge_traversed = true

        //     let dns = utils.get_downstream_nodes(op_whose_dns_to_nudge, op.children)
        //     dns.forEach(dn => {
        //         let min_x_dist = (Math.abs(dn.y_relative - op_whose_dns_to_nudge.y_relative) / 2)
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
